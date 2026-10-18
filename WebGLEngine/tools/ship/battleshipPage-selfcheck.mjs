// WebGLEngine/tools/ship/battleshipPage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/battleshipPage-selfcheck.mjs      (~3 min: a real browser, software rendering, forty full fights of up to 120 s)
//
// THE PAGE-WIRING GATE for space-battleship.html. Everything the page WIRES TOGETHER -- brain/battleshipFight.mjs (the scenario, the gunners, the tally: pinned on its own), brain/spaceArena.mjs (the ship, its thirteen seats, its parts, the cannon, the fighters' doctrine: held on its own),
// physics/mechanics/capitalShip.mjs, render/flightViews.mjs (the cameras, nextWindow, seatRows, the vacuum sight, the 6DOF pilot's activations), brain/pilot6dofPolicy.mjs and its three shipped weight files -- is gated on its own; this file proves the WIRING in a real browser: the page
// boots with no error and flies the fight it says, ONE WINDOW PER CRAFT stacked down the right (the ship's first and taller), a CLICK on the ship's window goes plane -> pilot -> seat 1 ... seat 13 -> brain -> plane (a fighter's goes plane -> pilot -> gunner -> brain) without touching the
// others, the views are really different pictures (the WebGL pixels under each window are read back), a gun seat's window draws the sight for the target THAT gunner chose, in VACUUM (the pipper and the lead pip, where flightViews.gunsight puts them with gravity 0 -- and not where the Earth's gravity
// would), the brain windows show the pilots' own numbers (a fighter's twelve features, its network's 34 hidden and five outputs or the PD's five commands; the hull and a row per seat for the ship), the turrets the scene draws point where the seats point, an engine pod or a turret or a mount shot
// to nothing goes dark and the card and the log say so, the wave-motion cannon's charge and beam are drawn, the big picture marks every craft, and the options -- the attack, the seed, how many fighters, the gunners' skill, the fighters' pilot (the PD autopilot, the network twin, the shipped pilot,
// the league pilot, the close-quarters pilot, a mix), the ship's behaviour and cruise -- are the fight that runs: every one is checked against brain/battleshipFight.fight() run here, to the bit in every count. The stack scrolls when the craft do not fit and a window half out of it is cut at its
// edge. The exact state is read through window.__battleship (a hook the page exposes, whose step(n) is the gate's clock: no waiting on frames).
//
// SABOTAGE LOG -- NINETY-ONE (and fourteen more for friendly fire, below), each applied to space-battleship.html in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
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
//   BSP91 the dots stay on while the windows are drawn 1 | BSP92 the dots are off in the plane windows only 1   (these two, after the rest, once the page records whether the dots are on at each window's render)
// AND 14 MORE ONCE THE PAGE HAD THE FRIENDLY-FIRE AND HOLD-FIRE BOXES (the interlock and hold readouts, the friendly log and counts), each red by name:
//   BSP93 the friendly-fire box is ignored 6 | BSP94 the hold-fire box is ignored 4 | BSP95 friendly fire is on by default 1 | BSP96 a change of the friendly-fire or hold box does not start a new fight 1
//   BSP97 the seat window never says INTERLOCK 1 | BSP98 a fighter's window never says HOLD 1 | BSP99 a friendly hit is not logged 1 | BSP100 the ship's card says nothing of friendly fire 2
//   BSP101 the card says the rules are on when they are off 1 | BSP102 the fighters' card has no friendly or held counts 1 | BSP103 the hook hides which seat is blocked 1
//   BSP104 the boxes do not follow the fight that was built 1 | BSP105 a friendly hit's log names the wrong victim 1
//   BSP106 the friendly-fire log is rate-limited for the whole fight, not per shooter and victim 1
// TWO OF THEM WENT 0 RED THE FIRST TIME AND WERE FIXED IN THE GATE: BSP95 (friendly fire on by default) because every fight the gate started named its options -- the controls' own default was never taken: the change-event row now reads, for each control changed in turn, that friendly fire stayed OFF and hold fire ON until one of THOSE two was changed; BSP105 (a friendly hit's log naming the wrong victim) because the only friendly hits in the fights are the ship's on itself -- a fighter with a team-mate put 40 units ahead of it and the hold off now gives one, and the row reads 'fighter A hit fighter B'. The row then found a real bug: the log's rate limit (one friendly line in 15 ticks) was for the whole fight, so the ship shooting itself hid a fighter shooting a fighter -- it is per shooter and victim now (BSP106).
// FIVE WENT 0 RED THE FIRST TIME AND WERE FIXED IN THE GATE, NOT EXCUSED: BSP25 and BSP24 (the PD's thrust shown as 0 or 1 where the network's scale is -1 or +1, and its torque shown without the network's gain of 40) because the brain rows were only compared at tick 60, when every fighter has its engine on and the pitch and yaw torques are 0 -- all eight fighters' rows are now compared with the module's at tick 480, with a premise that some fighter has its thrust CUT, some its trigger pulled and a pitch and a yaw torque that are not zero (0.01 and 0.04 of the network's scale: small, and the row holds them to 1e-5; the roll torque is 0 in every PD fight, so the roll version of BSP24 is an equivalent mutant and the sabotage is made on the pitch and the yaw, BSP24 and BSP88); BSP85 (the overview leaving out all but the first two fighters) because a stern attack keeps the fighters close together -- a swarm of twelve, which comes from every side, is now held in frame too; BSP87 (the stat line counting only the destroyed, not the rammed) because no fight in the tree has a fighter that touches the hull -- the gate now puts one there with the page's own ram() hook and reads the stat line, the log, the card, the ship's 1,475 hit points and the grey marker; BSP56 (the stack not scrolling) because overflow-y:visible beside overflow-x:hidden COMPUTES to auto -- it was an equivalent mutant; the sabotage is now overflow:hidden and the gate reads the stack's computed overflow. NOT HELD, SAID PLAINLY: the page's look (the ship's hull, tower and pods, the stars) is read by eye in the screenshots, not by a row; the sabotages of the first pass ran against the gate before those five rows existed and the five were re-run against the final gate (every row added only makes a sabotage redder, and the options comparison was re-ordered to the shared-first order the module now gives).
// AND SIXTEEN MORE ONCE THE PAGE HAD THE WRECKS, IMPACTS AND CREW BOXES (BSP107-BSP122: the boxes follow the fight built, a dead gunner's window and turret, the log, the card, the hooks), each red by name:
//   BSP107 the wrecks box is ignored 4 | BSP108 the impacts box is ignored 3 | BSP109 the crew box is ignored 5 | BSP110 the impacts box gives a heavier round 2
//   BSP111 the boxes do not follow the fight that was built 1 | BSP112 a change of the crew box does not start a new fight 1 | BSP113 a crew death is not logged 2 | BSP114 a dead gunner's window never says so 1
//   BSP115 a dead gunner's window says SEAT OUT too 1 | BSP116 a dead gunner's turret is not drawn differently 1 | BSP117 a dead gunner's turret is drawn as a destroyed one 1
//   BSP118 the card says nothing of the crew 2 | BSP119 the card says the bridge is at its post when it is not 1 | BSP120 the card counts no gunners killed 1 | BSP121 the hook hides the dead gunners 1
//   BSP122 the hook hides the helm 1
// AND SIXTEEN MORE ONCE THE PAGE HAD A SECOND SHIP AND AN ESCORT (P1-P18 less the two that were dropped as equivalent; run on the gate without the rows before them, which can only add reds), each red by name:
//   P1 the ships control is ignored 1 | P2 the escorts control is ignored 1 | P3 a change of the ships or escorts does not start a new fight 1 | P4 escorts' markers are orange 1
//   P5 the second ship's card shows the first's numbers 1 | P6 shoot ignores which ship 1 | P7 both ships are 'battleship' 1 | P8 a part out does not say which ship 1 | P9 the windows are sized for one ship 1
//   P10 the escorts' rounds are drawn as the ship's point defence 1 | P11 the URL's ships is ignored 1 | P12 the URL's escorts is ignored 1 | P13 the second ship's card is never filled 2
//   P15 the second ship shows the network of the first ship's window's seat 1 | P17 the escorts' card names no escort 1 | P18 an escort's brain window shows the attackers' pilot 1
// FIVE WENT 0 RED THE FIRST TIME AND WERE GAPS IN THE GATE: P1, P2 and P3 (the ships and escorts controls ignored, or a change of them not restarting the fight -- every fight the rows started named its options, so a control's own value was never read: the controls row now sets them and presses New fight, and a change event of each is dispatched), P9 (the windows sized for one ship -- two ships and four attackers in a page 1,250 px tall are 148 px windows that fit, and 160 that overflow by a hundred) and P18 (an escort's brain window titled as an attacker's -- the attackers fly the same PD autopilot, so the title is all that tells); a row was added for each and each re-run red.
// AND SIXTEEN MORE ONCE THE PAGE HAD A HAND ROSTER (R1-R16: the rule, two networks on their hand weights, two trained ones, the brain and gunner windows, the files that will not load, the URL), each red by name:
//   R1 the hand control is ignored 1 | R2 the network is not given to the fight 3 | R3 a hand that is not loaded is offered 2 | R4 the fruit fly's hand weights are the GPU brain's 1
//   R5 the hand weights are zero 1 | R6 the hand's label has no hash 1 | R7 the brain window never shows the network 2 | R8 an idle network's rows are not marked idle 1
//   R9 the trigger shown is the pitch output 1 | R10 the seat's window never says what the network did 1 | R11 a refused load takes the held hand away 1 | R12 the policy a hand file must be is wrong 4
//   R13 the URL's hand is ignored 1 | R14 the ship's card never names the hand 2 | R15 the state hides that a network is in the seats 3 | R16 the brain rows show the network on zeros 1
// R1 (the hand control ignored) and R4 (the fruit fly's hand weights the GPU brain's) went 0 red the first time, for the reasons above: the controls row now sets the hand, and the brain rows are read for all four networks (34 hidden units, 32).
// AND TWENTY-ONE MORE ONCE THE PAGE COULD PUT A DIFFERENT HAND IN THE TURRETS, IN THE POINT DEFENCE AND IN SINGLE SEATS (SH1-SH21: the two group controls, the seats field, the URL's main, pd and seats; run on the gate with only the rows between SEATHANDS-BEGIN and SEATHANDS-END -- the others can only add reds), each red by name:
//   SH1 the turrets' control is ignored 6 | SH2 the point defence's control is ignored 4 | SH3 the seats field is ignored 5 | SH4 the build is not given seatNetworks 7 | SH5 the URL's main is ignored 1 | SH6 the URL's pd is ignored 1
//   SH7 the URL's seats is ignored 1 | SH8 the note beside the field stays empty 1 | SH9 the state hides the problems 1 | SH10 a seat that is not there is passed to the build 2 (the page does not boot: the build refuses the key and the run is lost -- red, and it is why the page filters)
//   SH11 the brain rows use the base hand 1 | SH12 the seat's window never says the hand 1 | SH13 the card names one hand for a mixed ship 3 | SH14 the turrets' control does not start a fight 1 | SH15 'rule' for a group is taken as 'as the hand on the left' 1
//   SH16 'rule' for a seat is taken as 'as the hand on the left' 4 | SH17 the selects are not set to the fight that was built 3 | SH18 there is no 'as the hand on the left' option 1 | SH19 every seat is reported with the base hand 6
//   SH20 the card's point defence is the turrets' 2 | SH21 the seats field is not written back 2. None went 0 red.
// AND FIFTEEN MORE ONCE THE PAGE HAD A FORMATION BOX AND A SHIPS-COLLIDE BOX (V1-V15; run on the gate with only the rows between SHIPFORM-BEGIN and SHIPFORM-END), each red by name:
//   V1 the formation box is ignored 3 | V2 a formation is asked of the build whatever the ships 1 (the page does not boot: the build refuses one ship with a formation) | V3 the collide box is ignored 2 | V4 a ship collision is not logged 1 | V5 the zero-damage contacts are logged too 1
//   V6 the URL's formation is ignored 1 | V7 the URL's collide is ignored 1 | V8 the formation box does not start a fight 1 | V9 the collide box does not start a fight 1 | V10 the state hides the formation 3 | V11 the state hides the collisions 2
//   V12 the card never says the station 1 | V13 the formation box is not set to the fight built 4 | V14 the collide box is not set to the fight built 2 | V15 the ships' collision log names the wrong ships 1. None went 0 red.
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
import * as SG from "../../brain/seatGunnerPolicy.mjs";
import * as MG from "../../brain/seatGunnerMlp.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

// a network that is NOT the hand gunner: it corrects each seat's yaw by the range feature (unit 0) and fires on the sight's flag through a unit of its own (unit 1) -- so the page's fight with it is a different fight, and a wiring mistake shows
function rangeWeights(m) {
    const w = m.zeroWeights(), F = 12;
    if (m === SG) { const outBase = SG.FEATURES * SG.HIDDEN + SG.HIDDEN + SG.REC_EDGES; w[0 * F + 4] = 1; w[outBase + 0 * SG.HIDDEN + 0] = 6; w[1 * F + 3] = 1; w[outBase + 2 * SG.HIDDEN + 1] = 4; w[outBase + SG.HIDDEN * SG.OUTPUTS + 2] = -2; }
    else { const O_W2 = 416, O_W3 = 1472, O_B3 = 1568; w[0 * F + 4] = 1; w[O_W2 + 0 * 32 + 0] = 1; w[O_W3 + 0 * 32 + 0] = 6; w[1 * F + 3] = 1; w[O_W2 + 1 * 32 + 1] = 1; w[O_W3 + 2 * 32 + 1] = 4; w[O_B3 + 2] = -2; }
    return w;
}
const NET = { fly: SG, mlp: MG }, POLICY = { fly: "seatGunnerPolicy", mlp: "seatGunnerMlp" };
const CUSTOM = Object.fromEntries(Object.entries(NET).map(([id, m]) => [id, JSON.stringify(PB.exportBrain(PB.describePolicy(POLICY[id], m), rangeWeights(m), { score: 0.5, by: "the gate's own network", citation: "gate" }))]));
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }

console.log("battleshipPage-selfcheck -- space-battleship.html really wires the gated modules together\n");

const skip = webgpuSkipReason(createRequire(import.meta.url));
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***", ""); fails++; }
else {
    const run = await runInEngineOrigin({
        engineRoot: ENG, timeoutMs: 560000,
        script: `async () => {
            globalThis.__swekStep = "booting space-battleship.html in an iframe";
            const f = document.createElement("iframe");
            f.style.width = "1100px"; f.style.height = "1250px";
            f.src = "/space-battleship.html";
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
            const base = { kind: "beam", seed: 1, fighters: 8, gunners: "regular", f: "pd", behaviour: "face", cruise: 0.3, friendlyFire: false, holdFire: true, wrecks: false, impact: 0, crew: false, ships: 1, escorts: 0, hand: "rule", handMain: "", handPd: "", handSeats: "", formation: false, shipCollisions: false };   // every option named: an option left out is read off the page's own control, which the last fight left where it was

            // ---- the page's OWN default fight, before anything touches it ----
            out.boot = { windows: B.windows(), choices: B.roster.choices, label: B.roster.label, state: B.state(), cards: cards(), stat: sel("stat").textContent, note: sel("note").textContent,
                selects: ["kind", "seed", "nfight", "gunners", "pilotF", "behaviour", "cruise"].map((id) => sel(id).value), ff: sel("ff").checked, hold: sel("hold").checked, wrecks: sel("wrecks").checked, impact: sel("impact").checked, crew: sel("crew").checked, spheres: sel("spheres").checked, spheresShown: B.spheresShown(), markers: B.markers(), camMode: sel("camMode").value };
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
            out.opts.ffHold = fightOf({ ...base, kind: "beam", seed: 2, friendlyFire: true });
            out.opts.ffNo = fightOf({ ...base, kind: "beam", seed: 2, friendlyFire: true, holdFire: false });
            out.opts.ffOffHold = fightOf({ ...base, kind: "beam", seed: 2, holdFire: false });
            out.opts.crewBow = fightOf({ ...base, kind: "bow", seed: 1, crew: true });
            out.opts.impactBow = fightOf({ ...base, kind: "bow", seed: 1, impact: 0.002 });
            out.opts.wreckBow = fightOf({ ...base, kind: "bow", seed: 1, wrecks: true });
            out.opts.bowBase = fightOf({ ...base, kind: "bow", seed: 1 });

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
            set("kind", "stern"); set("seed", 3); set("nfight", 6); set("gunners", "green"); set("pilotF", "mix"); set("behaviour", "hold"); set("cruise", 0.5); set("ff", true); set("hold", false); set("wrecks", true); set("impact", true); set("crew", true); sel("newBtn").click(); B.step(3700);
            out.ui = { tally: B.tally(), state: B.state(), sel: ["kind", "seed", "nfight", "gunners", "pilotF", "behaviour", "cruise"].map((id) => sel(id).value), ff: sel("ff").checked, hold: sel("hold").checked, wrecks: sel("wrecks").checked, impact: sel("impact").checked, crew: sel("crew").checked };
            B.newFight({ ...base }); B.step(10);
            out.change = {};
            for (const [id, v] of [["gunners", "green"], ["kind", "stern"], ["seed", 7], ["nfight", 5], ["behaviour", "hold"], ["cruise", 0.6], ["pilotF", "shipped"], ["ff", true], ["hold", false], ["wrecks", true], ["impact", true], ["crew", true]]) {
                set(id, v); sel(id).dispatchEvent(new win.Event("change", { bubbles: true })); const st2 = B.state();
                out.change[id] = { tick: st2.tick, crafts: st2.crafts.length, kind: st2.scenario.kind, seed: st2.scenario.seed, gunners: st2.gunnerOptions, pilot: st2.pilots.id, behaviour: st2.behaviour, cruise: st2.cruise, ff: st2.friendlyFire, holdFire: st2.crafts[1].holdFire, wrecks: st2.wrecks, impact: st2.impact, crew: st2.crew };
            }

            // ---- the interlock and the hold: a beam attack with friendly fire on (the seats hold fire 426 times), the seat window and the log say so ----
            B.newFight({ ...base, seed: 2, friendlyFire: true }); let blockedSeat = -1, blockedTick = null;
            for (let t = 0; t < 700 && blockedSeat < 0; t++) { B.step(1, false); const sts = B.state().crafts[0].seats; blockedSeat = sts.findIndex((q) => q.blocked); blockedTick = B.state().tick; }
            B.step(0); const stB = B.state(); out.interlock = { seat: blockedSeat, tick: blockedTick, blocked: blockedSeat >= 0 ? stB.crafts[0].seats[blockedSeat].blocked : null, held: stB.crafts[0].held, card: cards()[0], ff: stB.friendlyFire, ffBox: sel("ff").checked, holdBox: sel("hold").checked };
            if (blockedSeat >= 0) { B.setView(0, "gunner", blockedSeat); out.interlock.texts = B.texts(0); B.setView(0, "plane"); }
            B.newFight({ ...base, seed: 2, friendlyFire: true, holdFire: false }); B.step(330); out.friendlyLog = { log: B.state().log, card: cards()[0], state: B.state(), ffBox: sel("ff").checked, holdBox: sel("hold").checked };
            const findStrafer = (opts) => { B.newFight(opts); let k = -1; for (let t = 0; t < 700 && k < 0; t++) { B.step(1, false); k = B.state().crafts.findIndex((c, i) => i > 0 && c.mode === "strafe" && c.status === "flying" && c.last && c.last.fire); } const m = k > 0 ? [1, 2, 3, 4, 5, 6, 7, 8].find((i) => i !== k && B.state().crafts[i].status === "flying") : -1; return { k, m }; };
            { const f1 = findStrafer({ ...base, seed: 2, friendlyFire: true }); out.crowd = { striker: f1.k, mate: f1.m };
              if (f1.k > 0 && f1.m > 0) { B.crowd(f1.k, f1.m, 40); B.step(1); const st3 = B.state(); out.crowd.held = st3.crafts[f1.k].last.held; out.crowd.heldCount = st3.crafts[f1.k].held; B.setView(f1.k, "gunner"); out.crowd.texts = B.texts(f1.k); out.crowd.card = cards()[1]; B.setView(f1.k, "plane"); }
              const f2 = findStrafer({ ...base, seed: 2, friendlyFire: true, holdFire: false }); out.crowd.noHold = { striker: f2.k, mate: f2.m };
              if (f2.k > 0 && f2.m > 0) { B.crowd(f2.k, f2.m, 40); B.step(15); const st4 = B.state(); Object.assign(out.crowd.noHold, { log: st4.log, friendlyHits: st4.crafts[f2.k].friendlyHits, taken: st4.crafts[f2.m].friendlyTaken, hits: st4.crafts[f2.k].hits, held: st4.crafts[f2.k].held }); } }

            // ---- the crew: a gunner dies before his mount (a bow attack, seed 1: main turret A's gunner by tick 680), and the bridge crew with twelve hits ----
            B.newFight({ ...base, kind: "bow", seed: 1, crew: true }); let dead0 = -1;
            for (let t = 0; t < 800 && dead0 <= 0 && !B.state().done; t++) { B.step(1, false); dead0 = B.state().crafts[0].crewDead.length; }
            B.step(0); const stC = B.state(); const downSeat = stC.crafts[0].seats.findIndex((q) => stC.crafts[0].crewDead.includes(q.id));
            out.crew = { dead: stC.crafts[0].crewDead, seat: downSeat, works: downSeat >= 0 ? stC.crafts[0].seats[downSeat].works : null, partsOut: stC.crafts[0].partsOut, log: stC.log, card: cards()[0], shown: B.seatShown(), tick: stC.tick };
            if (downSeat >= 0) { B.setView(0, "gunner", downSeat); out.crew.texts = B.texts(0); B.setView(0, "plane"); }
            B.newFight({ ...base, crew: true }); B.step(20); const w20 = B.state().crafts[0], v20 = Math.hypot(...w20.vel); B.step(10); const mid = B.state().crafts[0]; B.shoot("bridge", 12); B.step(10);
            const stH = B.state(), h0 = stH.crafts[0]; B.step(90); const h1 = B.state().crafts[0];
            out.helm = { helm: h0.helm, bridge: h0.crewBridge, mode: h0.last.mode, thrust: h0.last.thrust, log: stH.log, card: cards()[0], wAt: h0.w, wLater: h1.w, vAt: Math.hypot(...h0.vel), vLater: Math.hypot(...h1.vel), midHelm: mid.helm };
            // ---- wrecks: the same fight at tick 500 and 600, with the wrecks drifting and not ----
            const wreckRun = (opts) => { B.newFight({ ...base, kind: "bow", seed: 1, ...opts }); B.step(550); const a = B.state(); B.step(100); const b = B.state(); return { a: a.crafts.map((c) => ({ pos: c.pos, status: c.status })), b: b.crafts.map((c) => ({ pos: c.pos, status: c.status })), markers: B.markers().pos.slice(), tick: b.tick }; };
            out.wreck = { on: wreckRun({ wrecks: true }), off: wreckRun({}) };

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
            B.newFight({ ...base, kind: "beam", seed: 1, gunners: "perfect" }); B.step(30); out.markersEarly = { m: B.markers(), state: B.state(), cards: cards() }; out.winMarkers = B.windowMarkers(); B.setView(0, "gunner", 2); B.setView(2, "pilot"); B.step(0); out.winMarkers2 = B.windowMarkers(); B.setView(0, "plane"); B.setView(2, "plane");
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

            // ---- the hands: the rule; two networks on their hand weights; a network that is not the hand, from a file; the brain and gunner windows; the roster; the URL ----
            {
              const Hn = B.hands, CUSTOM = ${JSON.stringify(CUSTOM)}, dataUrl = (t) => "data:application/json," + encodeURIComponent(t); out.hand = {};
              out.hand.choices0 = Hn.choices; B.newFight({ ...base }); out.hand.def = B.state().hand; out.hand.sel0 = sel("hand").value; out.hand.card0 = cards()[0];
              for (const id of ["flyhand", "mlphand"]) out.hand[id] = { ...fightOf({ ...base, hand: id }), sel: sel("hand").value, card: cards()[0] };
              for (const id of ["fly", "mlp"]) if (Hn.loaded(id)) out.hand["shipped_" + id] = { ...fightOf({ ...base, hand: id }), sel: sel("hand").value, card: cards()[0], label: Hn.label };
              out.hand.custom = {};
              for (const id of ["fly", "mlp"]) { const loaded = await Hn.loadHand(id, dataUrl(CUSTOM[id])); out.hand.custom[id] = { loaded, err: Hn.error(id), ...fightOf({ ...base, hand: id }), label: Hn.label, card: cards()[0] }; }
              out.hand.brain = {};
              for (const id of ["fly", "mlp", "flyhand", "mlphand", "rule"]) {
                B.newFight({ ...base, hand: id }); B.setView(0, "brain", 2); const idle = B.brainRows(0);
                let k = -1; for (let t = 0; t < 700 && k < 0; t++) { B.step(1, false); k = B.state().crafts[0].seats.findIndex((q) => q.last && q.last.target != null); }
                B.setView(0, "brain", k >= 0 ? k : 0); B.step(0); const tick = B.state().tick, rows = B.brainRows(0); B.setView(0, "gunner", k >= 0 ? k : 0); B.step(0); const texts = B.texts(0); B.setView(0, "plane");
                out.hand.brain[id] = { idle, k, tick, rows, texts };
              }
              Hn.forget("fly"); out.hand.afterForget = Hn.choices; B.newFight({ ...base, hand: "fly" }); out.hand.fallback = B.state().hand; out.hand.fallbackSel = sel("hand").value;
              out.hand.bad = await Hn.loadHand("fly", dataUrl("{not json")); out.hand.badErr = Hn.error("fly"); out.hand.badLoaded = Hn.loaded("fly");
              out.hand.wrong = await Hn.loadHand("fly", "/brain/pilot6dofWeightsDefault.json"); out.hand.wrongErr = Hn.error("fly"); out.hand.wrongLoaded = Hn.loaded("fly");
              out.hand.good = await Hn.loadHand("fly", dataUrl(CUSTOM.fly)); out.hand.goodErr = Hn.error("fly"); out.hand.goodLoaded = Hn.loaded("fly");
              out.hand.wrong2 = await Hn.loadHand("fly", "/brain/pilot6dofWeightsDefault.json"); out.hand.keptAfterRefuse = Hn.loaded("fly");
              out.hand.otherNet = await Hn.loadHand("fly", dataUrl(CUSTOM.mlp)); out.hand.otherNetErr = Hn.error("fly"); out.hand.keptAfterOther = Hn.loaded("fly");
              const f2 = document.createElement("iframe"); f2.style.width = "1100px"; f2.style.height = "900px"; f2.src = "/space-battleship.html?hand=mlphand&kind=swarm&seed=4&crew=1&ff=1&hold=0&wrecks=1&impact=1&fighters=5&ships=2&escorts=2"; document.body.appendChild(f2);
              await new Promise((res) => { f2.onload = res; }); const t1 = performance.now(); while (performance.now() - t1 < 40000 && !f2.contentWindow.__battleship) await wait(200);
              const B2 = f2.contentWindow.__battleship; await B2.ready; B2.hold(true); const s2 = B2.state();
              out.hand.url = { hand: s2.hand, scenario: s2.scenario, crew: s2.crew, ff: s2.friendlyFire, wrecks: s2.wrecks, impact: s2.impact, n: s2.crafts.length, holdFire: s2.crafts[0].holdFire, sel: f2.contentWindow.document.getElementById("hand").value, ships: s2.ships, escorts: s2.escorts, nships: f2.contentWindow.document.getElementById("nships").value, nesc: f2.contentWindow.document.getElementById("nesc").value }; f2.remove();
              B.newFight({ ...base });
            }

            // ---- a second ship and an escort ----
            {
              out.nb4 = {}; const Y = { ...base, ships: 2, escorts: 3 };
              out.nb4.fight = fightOf(Y); out.nb4.cards = cards(); out.nb4.cardIds = [...doc.querySelectorAll(".card")].map((d) => d.id); out.nb4.windows = B.windows(); out.nb4.ctrl = [sel("nships").value, sel("nesc").value]; out.nb4.shipBoxes = [...doc.querySelectorAll(".win")].map((d) => d.className.includes("ship"));
              B.newFight(Y); B.step(10); out.nb4.markers = B.markers(); out.nb4.glow = B.fighterGlow().length; out.nb4.tracers = []; B.step(90);
              for (let t = 0; t < 10; t++) { B.step(60); out.nb4.tracers.push(B.tracers()); }
              B.newFight(Y); B.step(20); B.shoot("engine pod 2", 6, 1); B.step(8); const stE2 = B.state();
              out.nb4.engine = { s0: B.engineShown(0), s1: B.engineShown(1), running: stE2.crafts.filter((c) => c.kind === "capital").map((c) => c.enginesRunning), log: stE2.log, cards: cards(), seatsB: B.seatShown(1).length };
              B.setView(9, "brain", 0); out.nb4.brainB = B.brainRows(9); doc.querySelectorAll(".win")[10].scrollIntoView({ block: "nearest" }); B.setView(10, "brain", 0); out.nb4.brainE = B.brainRows(10); out.nb4.brainEtexts = B.texts(10); out.nb4.labels = B.windows().map((w) => w.label);
              out.nb4.shipped = fightOf({ ...Y, f: "shipped" });
              B.newFight({ ...base, ships: 2, fighters: 4 }); f.style.height = "1250px"; await wait(300); B.step(2); { const stk = doc.getElementById("stack"); out.nb4.fit = { scrollHeight: stk.scrollHeight, clientHeight: stk.clientHeight, windows: B.windows().length }; }
              B.newFight({ ...base }); set("nships", 2); set("nesc", 2); set("hand", "mlphand"); sel("newBtn").click(); B.step(3700); out.nb4.ui = { tally: B.tally(), state: B.state(), sel: ["nships", "nesc", "hand"].map((id) => sel(id).value) };
              B.newFight({ ...base }); B.step(10); out.nb4.change = {};
              for (const [id, v] of [["nships", 2], ["nesc", 3], ["hand", "flyhand"]]) { set(id, v); sel(id).dispatchEvent(new win.Event("change", { bubbles: true })); const st2 = B.state(); out.nb4.change[id] = { tick: st2.tick, crafts: st2.crafts.length, ships: st2.ships, escorts: st2.escorts, hand: st2.hand.id }; }
              B.newFight({ ...Y, hand: "mlphand" }); B.step(300); B.setView(9, "brain", 3); const bn = B.brainRows(9); out.nb4.brainNet = bn.length; out.nb4.brainNetLabels = bn.slice(-3).map((q) => q.label); B.newFight({ ...base });
            }

            // ==== SEATHANDS-BEGIN (browser): a hand per GROUP of seats and per SEAT. fly and mlp are the gate's own range-weights networks here (loaded above); the hands on hand weights are always there ----
            {
              globalThis.__swekStep = "full fights: a hand per group and per seat";
              const Hn = B.hands; Hn.refill();   // the rows above forgot the trained fruit fly and loaded the gate's own: the page refills its rosters after a load at boot, and so does this
              out.seats = { loaded: [Hn.loaded("fly"), Hn.loaded("mlp")], options: ["handMain", "handPd"].map((id) => [...sel(id).options].map((o) => o.value + (o.disabled ? "!" : ""))) };
              const grab = (o) => { const r = fightOf({ ...base, ...o }); return { tally: r.tally, seatHands: r.state.seatHands, problems: r.state.handProblems, hand: r.state.hand, card: cards()[0], sel: ["hand", "handMain", "handPd", "handSeats"].map((id) => sel(id).value), note: sel("handNote").textContent }; };
              out.seats.plain = grab({});
              out.seats.groups = grab({ handMain: "fly", handPd: "mlp" });
              out.seats.single = grab({ hand: "fly", handMain: "mlphand", handSeats: "main-a:flyhand pd-p1:mlp pd-p2:rule" });
              out.seats.pdRule = grab({ hand: "fly", handPd: "rule" });
              out.seats.seatRule = grab({ hand: "fly", handSeats: "pd-p2:rule" });
              out.seats.junk = grab({ handSeats: "main-z:fly pd-p1:nothing port:fly junk" });
              B.newFight({ ...base, hand: "mlp", handMain: "fly" }); B.step(300); out.seats.win = [];
              for (let k = 0; k < 13; k++) { B.setView(0, "brain", k); const rows = B.brainRows(0); B.setView(0, "gunner", k); B.step(0); out.seats.win.push({ k, rows: rows.length, n: rows.slice(-3).map((q) => q.n), texts: B.texts(0).filter((t) => /^(net|hand):/.test(t)) }); }
              B.setView(0, "plane");
              // the controls start the fight they name
              B.newFight({ ...base }); out.seats.ctl = {};
              for (const [id, v] of [["handMain", "flyhand"], ["handPd", "mlphand"]]) { set(id, v); sel(id).dispatchEvent(new win.Event("change", { bubbles: true })); out.seats.ctl[id] = { tick: B.state().tick, seatHands: B.state().seatHands, sel: sel(id).value }; }
              set("handSeats", "pd-p1:rule"); sel("handSeats").dispatchEvent(new win.Event("change", { bubbles: true })); out.seats.ctl.handSeats = { tick: B.state().tick, seatHands: B.state().seatHands, sel: sel("handSeats").value };
              const f3 = document.createElement("iframe"); f3.style.width = "1100px"; f3.style.height = "900px"; f3.src = "/space-battleship.html?main=flyhand&pd=mlphand&seats=pd-p1:rule"; document.body.appendChild(f3);
              await new Promise((res) => { f3.onload = res; }); const t3 = performance.now(); while (performance.now() - t3 < 40000 && !f3.contentWindow.__battleship) await wait(200);
              const B3 = f3.contentWindow.__battleship; await B3.ready; B3.hold(true); const s3 = B3.state(), d3 = f3.contentWindow.document;
              out.seats.url = { seatHands: s3.seatHands, sel: ["hand", "handMain", "handPd", "handSeats"].map((id) => d3.getElementById(id).value), problems: s3.handProblems }; f3.remove();
              B.newFight({ ...base });
            }
            // ==== SEATHANDS-END (browser)

            // ==== SHIPFORM-BEGIN (browser): the second ship in station and the ships that collide ----
            {
              globalThis.__swekStep = "full fights: a ship in station and ships that collide";
              const grab2 = (o) => {
                B.newFight({ ...base, ...o }); const seen = [];
                for (let k = 0; k < 125 && !B.state().done; k++) { B.step(30, false); for (const l of B.state().log) if (/THE SHIPS COLLIDED/.test(l) && !seen.includes(l)) seen.push(l); }
                B.step(0); const st = B.state();
                return { tally: B.tally(), formation: st.formation, shipCollisions: st.shipCollisions, ships: st.ships, hp: st.crafts.filter((c) => c.kind === "capital").map((c) => Math.round(c.hp)), seen, cards: cards(), sel: [sel("formation").checked, sel("collide").checked, sel("nships").value] };
              };
              out.form = {};
              out.form.off = grab2({ ships: 2 });
              out.form.on = grab2({ ships: 2, formation: true });
              out.form.one = grab2({ ships: 1, formation: true });
              const G12 = { kind: "stern", seed: 8, fighters: 12, gunners: "green", ships: 2 };
              out.form.pass = grab2(G12);
              out.form.hit = grab2({ ...G12, shipCollisions: true });
              out.form.both = grab2({ ...G12, shipCollisions: true, formation: true });
              B.newFight({ ...base, ships: 2 }); out.form.ctl = {};
              set("formation", true); sel("formation").dispatchEvent(new win.Event("change", { bubbles: true })); out.form.ctl.formation = { tick: B.state().tick, formation: B.state().formation, sel: sel("formation").checked };
              set("collide", true); sel("collide").dispatchEvent(new win.Event("change", { bubbles: true })); out.form.ctl.collide = { tick: B.state().tick, shipCollisions: B.state().shipCollisions, sel: sel("collide").checked };
              const f4 = document.createElement("iframe"); f4.style.width = "1100px"; f4.style.height = "900px"; f4.src = "/space-battleship.html?ships=2&formation=1&collide=1"; document.body.appendChild(f4);
              await new Promise((res) => { f4.onload = res; }); const t4 = performance.now(); while (performance.now() - t4 < 40000 && !f4.contentWindow.__battleship) await wait(200);
              const B4 = f4.contentWindow.__battleship; await B4.ready; B4.hold(true); const s4 = B4.state(), d4 = f4.contentWindow.document;
              out.form.url = { formation: s4.formation, shipCollisions: s4.shipCollisions, ships: s4.ships, sel: [d4.getElementById("formation").checked, d4.getElementById("collide").checked, d4.getElementById("nships").value] }; f4.remove();
              B.newFight({ ...base });
            }
            // ==== SHIPFORM-END (browser)

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

    ok("the harness booted space-battleship.html and found window.__battleship", run.ok && run.result && run.result.booted, run.ok ? (run.result ? "" : "no result") : String(run.reason || JSON.stringify(run)).slice(0, 300));
    if (run.pageErrors && run.pageErrors.length) report("page console errors", run.pageErrors.slice(0, 5).join(" | ").slice(0, 400));
    // the run asks for one file that is not there ON PURPOSE (the pilot file's failure path): the browser logs that as one 404, and nothing else may be logged
    const errs404 = (run.pageErrors || []).filter((e) => /\b404\b/.test(e)), other = (run.pageErrors || []).filter((e) => !/\b404\b/.test(e));
    // a trained gunner's file that is not shipped is asked for by each of the two pages the run loads (the page itself and the URL test's) and is a 404 each time: the allowance is the gate's own one on purpose plus exactly those
    const absentHands = ["seatGunnerWeightsDefault.json", "seatGunnerMlpWeightsDefault.json"].filter((f) => !fs.existsSync(path.join(ENG, "brain", f))).length;
    ok("!! no page errors were logged during the whole run -- except the ONE 404 the gate asks for on purpose (the pilot file that is not there) and the 404s for a trained gunner's file that is not shipped (two pages ask for each; none once both are shipped); a second missing file would be another 404", other.length === 0 && errs404.length <= 1 + 2 * absentHands, `${other.length} other, ${errs404.length} x 404 (allowed ${1 + 2 * absentHands}) ${other.slice(0, 2).join(" | ").slice(0, 200)}`);

    if (run.ok && run.result && run.result.booted) {
        const r = run.result;
        const blobOf = (f) => JSON.parse(fs.readFileSync(path.join(ENG, "brain", f), "utf8")), weightsOf = (f) => Float32Array.from(blobOf(f).weights);
        const WS = weightsOf("pilot6dofWeightsDefault.json"), WL = weightsOf("pilot6dofWeightsLeague.json"), WC = weightsOf("pilot6dofWeightsClose.json"), WH = P6.handWeights();
        const SHIPPED = P6.pilotFor(WS), LEAGUE = P6.pilotFor(WL), CLOSE = P6.pilotFor(WC), HAND = P6.pilotFor(WH), MIX = [undefined, SHIPPED, LEAGUE, CLOSE];
        const DESC = PB.describePolicy("pilot6dofPolicy", P6), shipImp = PB.importBrain(DESC, blobOf("pilot6dofWeightsDefault.json"));
        const SHIP = CS.createCapitalShip(), seatsOf = SHIP.seats;
        // the page's tally against battleshipFight.fight()'s, to the bit in every count it reports
        const same = (a, b) => ["winner", "over", "ticks", "killed", "rammed", "flying", "damageOnShip"].every((k) => Object.is(a[k], b[k])) && ["status", "hpLeft", "enginesRunning", "seatRounds", "hitsDealt", "waves", "charge"].every((k) => Object.is(a.ship[k], b.ship[k])) && a.ship.partsOut.join() === b.ship.partsOut.join()
            && a.fighters.length === b.fighters.length && a.fighters.every((f, i) => f.status === b.fighters[i].status && f.hpLeft === b.fighters[i].hpLeft && f.fired === b.fighters[i].fired && f.hitsDealt === b.fighters[i].hitsDealt && f.mode === b.fighters[i].mode);
        const line = (t) => `${t.winner}, ${t.ticks} ticks, ${t.killed} shot down, ${t.damageOnShip} damage on the ship`;

        // ---- 1 the boot ----
        const b = r.boot;
        ok("!! THE PAGE'S OWN FIGHT (before the gate touches it) is a beam attack, seed 1, eight fighters, regular gunners, the PD autopilot for the fighters, the ship facing the enemy at 0.3 cruise, the hit spheres OFF, the big picture on the overview, at tick 0 with everyone flying and nine markers",
            b.selects.join() === "beam,1,8,regular,pd,face,0.3" && b.ff === false && b.hold === true && b.state.friendlyFire === false && b.spheres === false && b.spheresShown.length === 22 && b.spheresShown.every((v) => v === false) && /PD autopilot/.test(b.label) && b.state.tick === 0 && b.state.crafts.length === 9 && b.state.crafts.every((c) => c.status === "flying") && b.camMode === "overview" && b.markers.n === 9 && b.markers.visible === true, `${b.selects.join()} | ${b.label}`);
        ok("!! the roster offers all six pilots for the fighters, every one enabled (the PD autopilot; the PD written into the network; the shipped pilot; the league-trained one; the close-quarters one; a mix of them in turn)", b.choices.map((c) => c.id).join() === "pd,hand,shipped,league,close,mix" && b.choices.every((c) => !c.disabled));
        ok("!! NINE WINDOWS, one per craft, THE SHIP'S FIRST AND TALLER, each showing the plane from outside to start with, each labelled with its number, its name and the view", b.windows.length === 9 && b.windows.every((w, i) => w.craft === i && w.view === "plane" && w.label.startsWith(`${i + 1}. ${i ? "fighter " + i : "battleship"} --`) && /\(from outside/.test(w.label) && /click to switch/.test(w.label)) && b.windows[0].rect.height > b.windows[1].rect.height * 1.8 && b.windows.slice(1).every((w) => w.rect.height === b.windows[1].rect.height), b.windows.map((w) => w.label).join(" | ").slice(0, 200));
        ok("the board has two cards: the ship's (flying, 1500/1500, its three engine pods, the cannon at 0% and the parts out: none) and the fighters' (eight rows with the pilot named, each flying in its approach), and the stat line and the note name the fight",
            b.cards.length === 2 && /^battleship/.test(b.cards[0]) && /flying/.test(b.cards[0]) && /hit points 1500\/1500/.test(b.cards[0]) && /engines ● ● ● 3 of 3/.test(b.cards[0]) && /wave-motion cannon \(invented\) 0% charged, fired 0/.test(b.cards[0]) && /parts out: none/.test(b.cards[0]) && /gunners regular/.test(b.cards[0])
            && /^8 fighters/.test(b.cards[1]) && b.cards[1].includes(b.label) && /8 flying, 0 shot down, 0 rammed/.test(b.cards[1]) && (b.cards[1].match(/approach/g) || []).length === 8 && /beam 1/.test(b.stat) && /0 of 8 fighters down/.test(b.stat) && /click a window/.test(b.note) && /1-13/.test(b.note), `${b.stat}`);
        ok("!! THE MARKERS: nine, one per craft, at the crafts' own positions, the ship's teal and the fighters' orange, in the big picture", (() => { const m = b.markers, st = b.state.crafts; return st.every((c, i) => Math.abs(m.pos[i * 3] - c.pos[0]) < 1e-3 && Math.abs(m.pos[i * 3 + 1] - c.pos[1]) < 1e-3 && Math.abs(m.pos[i * 3 + 2] - c.pos[2]) < 1e-3) && m.color[1] > 0.9 && m.color[2] > 0.7 && m.color[0] < 0.4 && [1, 2, 3, 4, 5, 6, 7, 8].every((i) => m.color[i * 3] > 0.9 && m.color[i * 3 + 1] > 0.5 && m.color[i * 3 + 2] < 0.4); })());

        // the brain window's numbers are the pilots' own: at tick 60 the ship's hull row and the PD fighter's features and commands, from the same fight run here
        const ref = BS.build(1, "beam").arena; for (let i = 0; i < 60; i++) SA.stepSpaceArena(ref);
        const near3 = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i])), clamp1 = (v) => Math.max(-1, Math.min(1, v)), closeTo = (a, bb, tol) => a.length === bb.length && a.every((v, i) => Math.abs(v - bb[i]) <= tol);
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
        const ffHold = BS.fight(2, "beam", { friendlyFire: true }), ffNo = BS.fight(2, "beam", { friendlyFire: true, holdFire: false }), beam2 = BS.fight(2, "beam");
        ok("!! FRIENDLY FIRE AND HOLD FIRE ARE WIRED: a beam attack (seed 2) with the friendly-fire box checked and the hold box on is battleshipFight.fight()'s with the option (the ship's seats hold fire 426 ticks, no friendly hit, the same 180 damage as the fight without it); with the hold box unchecked it is the module's fight in which the ship shoots itself (850 of its own hit points, 1,030 damage); with friendly fire off the hold box changes nothing (the module's fight without the option)",
            same(o.ffHold.tally, ffHold) && o.ffHold.tally.friendlyHits === 0 && o.ffHold.tally.ship.held === 426 && o.ffHold.tally.damageOnShip === 180 && same(o.ffNo.tally, ffNo) && o.ffNo.tally.friendlyHits === 850 && o.ffNo.tally.damageOnShip === 1030 && same(o.ffOffHold.tally, beam2) && o.ffOffHold.state.friendlyFire === false && o.ffNo.state.friendlyFire === true && o.ffNo.state.crafts.every((c) => c.holdFire === false), `hold ${line(o.ffHold.tally)} / no hold ${line(o.ffNo.tally)}`);
        const crewBow = BS.fight(1, "bow", { crew: true }), impactBow = BS.fight(1, "bow", { impact: 0.002 }), bowBase = BS.fight(1, "bow"), wreckBow = BS.fight(1, "bow", { wrecks: true });
        ok("!! CREW, IMPACTS AND WRECKS ARE WIRED: a bow attack (seed 1) with the crew box checked is battleshipFight.fight()'s with the crew (main turret A's gunner killed, the fight otherwise the one without it), with impacts on is the module's with a round of 0.002 (658 ticks and 72 damage against the 680 and 180 without), and with the wrecks drifting it is the fight without them to the bit -- a wreck is no target and no shooter",
            same(o.crewBow.tally, crewBow) && o.crewBow.tally.ship.crewDead.join() === "main turret A" && same(o.impactBow.tally, impactBow) && o.impactBow.tally.ticks === 658 && o.impactBow.tally.damageOnShip === 72 && o.bowBase.tally.ticks === 680 && o.bowBase.tally.damageOnShip === 180 && same(o.bowBase.tally, bowBase) && same(o.wreckBow.tally, wreckBow) && same(o.wreckBow.tally, o.bowBase.tally) && o.crewBow.state.crew === true && o.impactBow.state.impact === 0.002 && o.wreckBow.state.wrecks === true && o.bowBase.state.crew === false && o.bowBase.state.impact === 0 && o.bowBase.state.wrecks === false, `crew ${line(o.crewBow.tally)}; impact ${line(o.impactBow.tally)}`);
        const pilotRuns = { shipped: BS.fight(1, "swarm", { gunners: "green", pilot: SHIPPED }), league: BS.fight(2, "swarm", { pilot: LEAGUE }), close: BS.fight(2, "swarm", { pilot: CLOSE }), hand: BS.fight(2, "bow", { pilot: HAND }), mix: BS.fight(2, "swarm", { pilot: MIX }) }, pdSwarm2 = BS.fight(2, "swarm");
        ok("!! A DIFFERENT PILOT FOR THE FIGHTERS IS A DIFFERENT FIGHT: the shipped pilot (against green gunners in a swarm), the league pilot, the close-quarters pilot, the network twin of the PD (hand weights) and a mix of the PD, the shipped, the league and the close pilot in turn each fly the fight battleshipFight.fight() runs for that pilot, to the bit -- and the league, close and mix fights are not the PD autopilot's on the same seed",
            ["shipped", "league", "close", "hand", "mix"].every((id) => same(o[id].tally, pilotRuns[id])) && ["league", "close", "mix"].every((id) => !same(o[id].tally, pdSwarm2)) && same(o.pdBeside.tally, pdSwarm2), ["shipped", "league", "close", "hand", "mix"].map((id) => `${id}: ${line(o[id].tally)}`).join("; "));
        ok("!! the pilot's label says which pilot flew, with the hash of the weights file it was loaded from and its held-out score (the shipped pilot's 9.934), and a mix names its four", /6DOF pilot, shipped/.test(o.shipped.state.pilots.label) && o.shipped.state.pilots.label.includes(weightsHash(shipImp.weights)) && /held-out 9\.934/.test(o.shipped.state.pilots.label) && o.mix.state.pilots.list.map((p) => p.id).join() === "pd,shipped,league,close" && /mix/.test(o.mix.state.pilots.label), o.shipped.state.pilots.label);

        // ---- 3b the controls ----
        const ui = r.ui, uiWant = BS.fight(3, "stern", { fighters: 6, gunners: "green", pilot: MIX, behaviour: "hold", cruise: 0.5, friendlyFire: true, holdFire: false, wrecks: true, impact: 0.002, crew: true });
        ok("!! EVERY CONTROL IS THE FIGHT THAT RUNS: with the attack set to stern, the seed to 3, six fighters, green gunners, a mix of pilots, the ship holding its heading at 0.5 cruise, friendly fire ON and the hold OFF, the wrecks, the impacts and the crew ON -- all set on the page's own controls, then the New fight button pressed -- the fight that runs is battleshipFight.fight()'s with those options, to the bit, with the controls reading what was set",
            same(ui.tally, uiWant) && ui.sel.join() === "stern,3,6,green,mix,hold,0.5" && ui.ff === true && ui.hold === false && ui.state.friendlyFire === true && ui.wrecks === true && ui.impact === true && ui.crew === true && ui.state.wrecks === true && ui.state.impact === 0.002 && ui.state.crew === true && ui.state.crafts.every((c) => c.holdFire === false) && ui.state.pilots.id === "mix" && ui.state.crafts.length === 7 && ui.state.behaviour === "hold" && ui.state.cruise === 0.5, `page ${line(ui.tally)} / here ${line(uiWant)}`);
        const ch = r.change;
        ok("!! A CHANGE TO ANY CONTROL STARTS THE FIGHT AGAIN from tick 0 with what the controls say: the gunners' skill, the attack, the seed, the number of fighters, the ship's behaviour, its cruise and the fighters' pilot each, and the friendly-fire and hold-fire boxes, on its own change event, restart the fight with that setting taken (and with the other two boxes as they stand: friendly fire OFF and hold fire ON until one is changed)",
            Object.values(ch).every((c) => c.tick === 0) && JSON.stringify(ch.gunners.gunners) === JSON.stringify({ ...BS.SHARED, ...BS.GUNNERS.green }) && ch.kind.kind === "stern" && ch.seed.seed === 7 && ch.nfight.crafts === 6 && ch.behaviour.behaviour === "hold" && ch.cruise.cruise === 0.6 && ch.pilotF.pilot === "shipped" && ["gunners", "kind", "seed", "nfight", "behaviour", "cruise", "pilotF"].every((k) => ch[k].ff === false && ch[k].holdFire === true) && ch.ff.ff === true && ch.ff.holdFire === true && ch.hold.ff === true && ch.hold.holdFire === false && ["gunners", "kind", "seed", "nfight", "behaviour", "cruise", "pilotF", "ff", "hold"].every((k) => ch[k].wrecks === false && ch[k].impact === 0 && ch[k].crew === false) && ch.wrecks.wrecks === true && ch.wrecks.impact === 0 && ch.wrecks.crew === false && ch.impact.impact === 0.002 && ch.impact.crew === false && ch.crew.crew === true && ch.crew.wrecks === true && ch.crew.impact === 0.002, JSON.stringify(Object.fromEntries(Object.entries(ch).map(([k, c]) => [k, [c.tick, c.crafts, c.kind, c.seed, c.pilot, c.behaviour, c.cruise]]))));

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

        // ---- 5b the interlock and the hold, on the page ----
        {
            const il = r.interlock, fl = r.friendlyLog, cr = r.crowd;
            ok("!! THE INTERLOCK IS SHOWN: in a beam attack with friendly fire on, a seat whose line crosses the ship's own hull is blocked ('hull: <part>'), its window says 'INTERLOCK — hull: <part>' in orange, the ship's card says friendly fire is on with its rules on and counts the held ticks, and a fight with friendly fire OFF has none of that",
                il.seat >= 0 && /^hull: /.test(il.blocked) && il.texts.includes(`INTERLOCK — ${il.blocked}`) && /friendly fire ON, rules on/.test(il.card) && new RegExp(`seats held fire ${il.held} ticks`).test(il.card) && il.ff === true && il.ffBox === true && il.holdBox === true && !/friendly fire/.test(r.boot.cards[0]), `${il.blocked} at tick ${il.tick}, seat ${il.seat}`);
            ok("!! THE SHIP SHOOTING ITSELF IS SAID: with the hold off the log says 'FRIENDLY FIRE: battleship hit itself — <part>' with the hit points left, and the card says the rules are OFF and how much its own guns have taken off it, which is the arena's own friendlyTaken", fl.log.some((l) => /FRIENDLY FIRE: battleship hit itself — [\w ]+  \(\d+ of 1500 hit points left\)/.test(l)) && /rules OFF: its own guns have hit it for [1-9]\d*/.test(fl.card) && new RegExp(`hit it for ${fl.state.crafts[0].friendlyTaken},`).test(fl.card) && fl.state.crafts[0].friendlyTaken > 0 && fl.ffBox === true && fl.holdBox === false, fl.log.slice(-1)[0]);
            ok("!! A FIGHTER HOLDING FIRE SAYS SO IN ITS SIGHT: a strafing fighter whose trigger is down, with a team-mate put 40 units dead ahead of it, holds its trigger that tick (its record says held, its count goes up), its gunner window says 'HOLD — a team-mate in the line', and the fighters' card carries the friendly and held counts", cr.striker > 0 && cr.mate > 0 && cr.held === true && cr.heldCount >= 1 && cr.texts.some((t) => /^HOLD — a team-mate in the line/.test(t)) && new RegExp(`fighter ${cr.striker} .*friendly 0/0  held ${cr.heldCount}`).test(cr.card), JSON.stringify([cr.striker, cr.mate, cr.held, cr.heldCount]));
            const nh = cr.noHold;
            ok("!! A FIGHTER THAT SHOOTS A TEAM-MATE IS SAID TO HAVE: with the hold off, the same lineup gives FRIENDLY hits on the mate -- the log says 'FRIENDLY FIRE: fighter A hit fighter B' naming both, the shooter's friendlyHits equal the mate's friendlyTaken and are not its credited hits, and it holds nothing", nh.striker > 0 && nh.mate > 0 && nh.friendlyHits > 0 && nh.friendlyHits === nh.taken && nh.held === 0 && nh.log.some((l) => new RegExp(`FRIENDLY FIRE: fighter ${nh.striker} hit fighter ${nh.mate}  `).test(l)), JSON.stringify([nh.striker, nh.mate, nh.friendlyHits, nh.taken, nh.log.slice(-1)[0]]));
        }

        // ---- 5c the crew, the helm, the wrecks ----
        {
            const cw = r.crew, hm = r.helm, wk = r.wreck, angMom = (w) => Math.hypot(SHIP.I[0] * w[0], SHIP.I[1] * w[1], SHIP.I[2] * w[2]);
            ok("!! A GUNNER DIES BEFORE HIS MOUNT, AND THE PAGE SAYS SO: in the bow attack with the crew box checked, main turret A's gunner is killed (the arena's own record), its seat no longer works, its mount is NOT out (no part of it destroyed), its turret is drawn the dull grey of a mount with no one in it and not the black of a destroyed one, its window says 'GUNNER DOWN' and not 'SEAT OUT', the log says the gunner of main turret A is killed and his mount stands, and the ship's card counts '1 of 13 gunners killed (main turret A)'",
                cw.dead.join() === "main-a" && cw.seat === 0 && cw.works === false && cw.partsOut.length === 0 && cw.shown[0].crewDown === true && cw.shown[0].dead === false && cw.shown[0].look === "unmanned" && cw.shown.slice(1).every((q) => q.look === "live") && cw.shown.slice(1).every((q) => !q.crewDown && !q.dead) && cw.texts.includes("GUNNER DOWN") && !cw.texts.includes("SEAT OUT") && cw.log.some((l) => /the gunner of main turret A is KILLED \(his mount stands\)/.test(l)) && /crew: bridge at its post, 1 of 13 gunners killed \(main turret A\)/.test(cw.card) && /crew: /.test(cw.card), `${cw.dead}, tick ${cw.tick}, ${cw.card.slice(-90)}`);
            ok("!! THE BRIDGE CREW DIES AND THE HELM GOES: twelve hits of 18 on the bridge (216 against 200) leave the ship with no helm -- the arena's record, a log line 'BRIDGE CREW LOST', the card in red, the ship's mode 'no helm' and its thrust 0 -- and 90 ticks later its speed is exactly what it was the tick it happened and its angular MOMENTUM is the same to 1e-9 (the spin itself precesses, as a free box does: nobody is turning it); before the hits it had its helm",
                hm.midHelm === true && hm.helm === false && hm.bridge <= 0 && hm.mode === "no helm" && hm.thrust === 0 && hm.log.some((l) => /BRIDGE CREW LOST — the battleship has no helm and no cannon/.test(l)) && /BRIDGE CREW LOST: NO HELM, NO CANNON/.test(hm.card) && Math.abs(angMom(hm.wAt) - angMom(hm.wLater)) < 1e-9 * angMom(hm.wAt) && hm.vAt === hm.vLater && hm.wAt.some((v, i) => v !== hm.wLater[i]), `bridge ${hm.bridge}, w ${hm.wAt.map((v) => v.toFixed(4))}`);
            const refW = BS.build(1, "bow", { wrecks: true }).arena; for (let i = 0; i < 650; i++) SA.stepSpaceArena(refW);
            const wDead = wk.on.b.map((c, i) => [c, i]).filter(([c, i]) => i > 0 && wk.on.a[i].status !== "flying");
            ok("!! A WRECK DRIFTS ON THE PAGE: with the wrecks checked, at tick 650 of the bow attack every craft is where the module's arena has it (the positions to 1e-9, wrecks included: a tumbling wreck is integrated with sine and cosine, which two builds of V8 round differently in the last place -- the page and node differ by 6e-14 here), a fighter destroyed before tick 550 has moved since (by more than a unit) and its marker with it; with the box off it is where it was at tick 550",
                wk.on.b.every((c, i) => closeTo(c.pos, refW.crafts[i].body.pos, 1e-9)) && wDead.length >= 2 && wDead.every(([c, i]) => Math.hypot(c.pos[0] - wk.on.a[i].pos[0], c.pos[1] - wk.on.a[i].pos[1], c.pos[2] - wk.on.a[i].pos[2]) > 1) && wDead.every(([c, i]) => closeTo(wk.on.markers.slice(i * 3, i * 3 + 3), c.pos, 1e-3)) && wk.off.b.every((c, i) => wk.off.a[i].status === "flying" || near3(c.pos, wk.off.a[i].pos)), `pos ${wk.on.b.map((c, i) => Math.hypot(...c.pos.map((v, k) => v - refW.crafts[i].body.pos[k]))).map((d) => d.toExponential(0)).join(" ")}, ${wDead.length} wrecks, moved ${wDead.map(([c, i]) => Math.hypot(c.pos[0] - wk.on.a[i].pos[0], c.pos[1] - wk.on.a[i].pos[1], c.pos[2] - wk.on.a[i].pos[2]).toFixed(1)).join(" ")}`);
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
        ok("!! THE DOTS ARE OFF WHILE A WINDOW IS DRAWN (a 7-pixel square left over a craft in a window would hide it) and ON in the big picture: in each of the nine windows' renders, in the plane views and in a seat's view and a pilot's view, the markers were hidden, and after the frame they are visible", r.winMarkers.length === 9 && r.winMarkers.every((v) => v === false) && r.winMarkers2.length === 9 && r.winMarkers2.every((v) => v === false) && ml.m.visible === true && me.m.visible === true, JSON.stringify([r.winMarkers.length, r.winMarkers2.length]));
        ok("the log and the cards say what happened: the kills ('fighter k DESTROYED'), and the fighters' card shows a hollow circle and the status for a craft that is gone", ml.log.some((l) => /fighter \d DESTROYED/.test(l)) && /○ fighter \d +0 hp +destroyed/.test(ml.cards[1]) && /● fighter \d/.test(me.cards[1]) && !/○ fighter/.test(me.cards[1]), ml.log.slice(0, 3).join(" | "));

        // ---- 9 failure paths ----
        const F = r.fail;
        ok("!! A PILOT FILE THAT WILL NOT LOAD IS SAID AND THE PILOT THE PAGE HOLDS IS KEPT: a file that is not there gives 'HTTP 404', a flight pilot's file offered as the 6DOF pilot's is refused by name, neither takes the pilot away, and loading the good file again clears the error",
            F.missing === false && /HTTP 404/.test(F.missingErr) && F.stillLoaded === true && F.wrong === false && /pilotFlightPolicy/.test(F.wrongErr) && /pilot6dofPolicy/.test(F.wrongErr) && F.stillLoaded2 === true && F.good === true && F.goodErr === null, `${F.missingErr} | ${(F.wrongErr || "").slice(0, 100)}`);
        ok("!! a pilot whose file is not here is NOT OFFERED (disabled in the roster), a fight that asks for it anyway is flown by the PD autopilot with the label saying why, and a MIX leaves it out of its list until it is loaded again", F.choices.find((c) => c.id === "league").disabled === true && F.choices.find((c) => c.id === "mix").disabled === false && F.fallbackId === "pd" && /PD autopilot/.test(F.fallback) && /not loaded|could not/.test(F.fallback) && F.mixList.join() === "pd,shipped,close" && F.mixListAfter.join() === "pd,shipped,league,close", `${F.fallback} | ${F.mixList} -> ${F.mixListAfter}`);

        // ---- 9c the hands ----
        {
            const Hd = r.hand, ids = Hd.choices0.map((c) => c.id).join(), shipFile = (n) => fs.existsSync(path.join(ENG, "brain", n === "fly" ? "seatGunnerWeightsDefault.json" : "seatGunnerMlpWeightsDefault.json"));
            const O = { fighters: 8, gunners: "regular", behaviour: "face", cruise: 0.3 }, plain = BS.fight(1, "beam", O), net = (m, w) => BS.fight(1, "beam", { ...O, network: { module: m, weights: w } });
            const cw = { fly: rangeWeights(SG), mlp: rangeWeights(MG) }, NETS = { fly: SG, mlp: MG }, near5 = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-5);
            ok("!! THE HAND ROSTER OFFERS ITS FIVE AND THE PAGE STARTS WITH THE RULE: the rule, the fruit fly and the GPU brain on their hand weights (always there), and the two trained networks (offered only if their files are shipped and load); the page's own fight is the rule's, its select says rule, its state says no network and its card does not mention a hand",
                ids === "rule,flyhand,mlphand,fly,mlp" && Hd.choices0.filter((c) => ["rule", "flyhand", "mlphand"].includes(c.id)).every((c) => c.disabled === false) && Hd.choices0.filter((c) => c.id === "fly" || c.id === "mlp").every((c) => c.disabled === !shipFile(c.id)) && Hd.def.id === "rule" && Hd.def.network === false && Hd.sel0 === "rule" && !/hand:/.test(Hd.card0), ids + " " + Hd.choices0.map((c) => (c.disabled ? "x" : "ok")).join(""));
            ok("!! A NETWORK ON ITS HAND WEIGHTS IS THE SAME FIGHT ON THE PAGE: the fruit fly and the GPU brain, chosen in the roster, give battleshipFight.fight()'s tally with that network in every count -- which is also the tally of the fight with no network, the hand weights being the rule -- and the select, the state and the card say which is in the seats",
                [["flyhand", SG, "fruit fly, hand weights"], ["mlphand", MG, "GPU brain, hand weights"]].every(([id, m, name]) => same(Hd[id].tally, net(m, m.handWeights())) && same(Hd[id].tally, plain) && Hd[id].state.hand.id === id && Hd[id].state.hand.network === true && Hd[id].sel === id && Hd[id].card.includes("hand: " + name)) && plain.ship.seatRounds > 100, `${plain.ship.seatRounds} seat rounds`);
            for (const id of ["fly", "mlp"]) if (shipFile(id)) {
                const w = weightsOf(id === "fly" ? "seatGunnerWeightsDefault.json" : "seatGunnerMlpWeightsDefault.json"), got = Hd["shipped_" + id];
                ok(`!! THE SHIPPED ${id === "fly" ? "FRUIT FLY" : "GPU BRAIN"} GUNNER IS LOADED AND FLOWN: the roster offers it, the page's fight is battleshipFight.fight()'s with those weights in every count, and its label carries the weights' hash and held-out score`, !!got && same(got.tally, net(NETS[id], w)) && got.sel === id && got.label.includes(weightsHash(w)) && /held-out \d/.test(got.label) && got.state.hand.network === true);
            }
            const cu = Hd.custom;
            ok("!! A NETWORK THAT IS NOT THE HAND, LOADED FROM A FILE, IS THE FIGHT THE MODULE FLIES WITH IT: each of the gate's two (a yaw corrected by the range feature, a trigger through a unit of its own) loads, is the page's fight in every count -- not the rule's (the seats fire a different number of rounds) -- and its label carries the weights' hash and score",
                ["fly", "mlp"].every((id) => cu[id].loaded === true && cu[id].err === null && same(cu[id].tally, net(NETS[id], cw[id])) && !same(cu[id].tally, plain) && cu[id].tally.ship.seatRounds !== plain.ship.seatRounds && cu[id].state.hand.id === id && cu[id].state.hand.network === true && cu[id].label.includes(weightsHash(cw[id])) && /held-out 0\.5/.test(cu[id].label) && cu[id].card.includes("hand: ")), ["fly", "mlp"].map((id) => `${id} ${cu[id].tally.ship.seatRounds}`).join(", ") + ` rounds against ${plain.ship.seatRounds}`);
            const HW = { fly: cw.fly, mlp: cw.mlp, flyhand: SG.handWeights(), mlphand: MG.handWeights() }, HM = { fly: SG, mlp: MG, flyhand: SG, mlphand: MG };
            const brainChecks = ["fly", "mlp", "flyhand", "mlphand"].map((id) => {
                const m = HM[id], br = Hd.brain[id], ref = BS.build(1, "beam", { ...O, network: { module: m, weights: HW[id] } }).arena; for (let i = 0; i < br.tick; i++) SA.stepSpaceArena(ref);
                const seat = br.k >= 0 ? ref.crafts[0].seats[br.k] : null, last = seat && seat.decide.last, act = last && V.pilotActivations(m, HW[id], last.x), want = last && V.pilotRows({ who: seat.seat.id, act, featureNames: m.FEATURE_NAMES, outputNames: m.OUTPUT_NAMES }), tail = br.rows.slice(-3), idle = br.idle.slice(-3);
                return { id, ok: !!last && br.rows.length === 1 + 13 + 3 && tail.map((q) => q.label).join() === `s${br.k + 1} feat,s${br.k + 1} hidd,s${br.k + 1} outp` && tail.every((q, i) => q.n === want[i].values.length && near5(q.values, want[i].values)) && tail[0].n === 12 && tail[1].n === m.HIDDEN && tail[2].n === 3 && tail[2].values.some((v) => Math.abs(v) > 1e-3) && idle.map((q) => q.label).join() === "s3 idle,s3 idle,s3 idle" && idle.every((q) => q.values.every((v) => v === 0)) && br.idle.length === 17,
                    text: !!last && br.texts.some((t) => t === `net: yaw ${(last.y[0] * SG.AIM_GAIN * 180 / Math.PI).toFixed(1)}°  pitch ${(last.y[1] * SG.AIM_GAIN * 180 / Math.PI).toFixed(1)}°  trigger ${last.y[2].toFixed(2)}`) };
            });
            ok("!! THE SHIP'S BRAIN WINDOW SHOWS THE NETWORK IN THE SEAT IT IS ON (the fruit fly's with 34 hidden units, the GPU brain's with 32, on hand weights and on the gate's own): with a network for the hand the window grows three rows after the hull's and the thirteen seats' -- the twelve features the network was last shown, its hidden layer, its three outputs -- for the seat the ship's window is on, equal (to 1e-5) to what the module's own arena gives at the same tick and the library's activations; before the network has been asked (tick 0) the three rows are labelled idle and zero", brainChecks.every((q) => q.ok), brainChecks.map((q) => `${q.id} ${q.ok}`).join(" "));
            ok("!! ...and the seat's own window says what the network did to the aim: 'net: yaw +x.x° pitch +y.y° trigger +z.zz' -- the correction and the trigger the network gave the sight's answer, as the module's arena has them at that tick", brainChecks.every((q) => q.text), brainChecks.map((q) => `${q.id} ${q.text}`).join(" "));
            const rb = Hd.brain.rule;
            ok("!! WITH THE RULE FOR THE HAND THERE IS NO NETWORK TO SHOW: the ship's brain window is the hull's row and the thirteen seats' (14 rows, nothing idle or in features) and no seat's window says 'net:'; the page that started with the rule had the same", rb.k >= 0 && rb.rows.length === 14 && rb.idle.length === 14 && rb.rows.every((q) => !/idle|feat|hidd|outp/.test(q.label)) && rb.texts.every((t) => !/^net:/.test(t)));
            ok("!! A HAND WHOSE FILE IS NOT HERE IS NOT OFFERED, and a fight that asks for it anyway is flown by the rule: forgotten, the trained fruit fly is disabled in the roster, a fight naming it has the rule in the seats (state and select say rule)", Hd.afterForget.find((c) => c.id === "fly").disabled === true && Hd.fallback.id === "rule" && Hd.fallback.network === false && Hd.fallbackSel === "rule");
            ok("!! A FILE THAT WILL NOT LOAD IS SAID AND THE HAND THE PAGE HOLDS IS KEPT: text that is not JSON gives 'could not fetch it', a pilot's file offered as the gunner's is refused by name (both policies), neither is taken as the hand; the right file loads; a later refused one (a pilot's, and the GPU brain's file offered as the fruit fly's) leaves the good one in place",
                Hd.bad === false && /could not fetch it/.test(Hd.badErr) && Hd.badLoaded === false && Hd.wrong === false && /seatGunnerPolicy/.test(Hd.wrongErr) && /pilot6dofPolicy/.test(Hd.wrongErr) && Hd.wrongLoaded === false && Hd.good === true && Hd.goodErr === null && Hd.goodLoaded === true && Hd.wrong2 === false && Hd.keptAfterRefuse === true && Hd.otherNet === false && /seatGunnerPolicy/.test(Hd.otherNetErr) && /seatGunnerMlp/.test(Hd.otherNetErr) && Hd.keptAfterOther === true, Hd.wrongErr);
            const u = Hd.url;
            ok("!! THE URL CHOOSES THE FIGHT: ?hand=mlphand&kind=swarm&seed=4&crew=1&ff=1&hold=0&wrecks=1&impact=1&fighters=5&ships=2&escorts=2 starts a swarm attack, seed 4, five attackers, a second ship and two escorts (nine craft), with the GPU brain on its hand weights, the crew, friendly fire and the wrecks on, the hold-fire rule off and the impact the arena's round mass -- the select agrees", u.hand.id === "mlphand" && u.hand.network === true && u.sel === "mlphand" && u.scenario.kind === "swarm" && u.scenario.seed === 4 && u.n === 9 && u.ships === 2 && u.escorts === 2 && u.nships === "2" && u.nesc === "2" && u.crew === true && u.ff === true && u.wrecks === true && u.impact === SA.ROUND_MASS && u.holdFire === false, JSON.stringify(u).slice(0, 200));
        }

        // ==== SEATHANDS-BEGIN (node): a hand per group of seats and per seat ----
        {
            const S = r.seats, O = { fighters: 8, gunners: "regular", behaviour: "face", cruise: 0.3 }, ids = SHIP.seats.map((q) => q.id);
            const cwF = { module: SG, weights: rangeWeights(SG) }, cwM = { module: MG, weights: rangeWeights(MG) }, handF = { module: SG, weights: SG.handWeights() }, handM = { module: MG, weights: MG.handWeights() };
            const plainT = BS.fight(1, "beam", O), fightWith = (o) => BS.fight(1, "beam", { ...O, ...o });
            const want = (fn) => ids.map((id) => { const [from, hid] = fn(id); return `${id}:${from}:${hid}`; }).join(" "), got = (x) => x.seatHands.map((h) => `${h.seat}:${h.from}:${h.id}`).join(" "), isMain = (id) => /^main-/.test(id);
            ok("!! THE PAGE STARTS WITH THE SAME RULE IN EVERY SEAT AND OFFERS THE GROUPS: the turrets' and the point defence's selects offer 'as the hand on the left' first and then the five hands (the trained two enabled only if their files are shipped), both say so by default, the seats field is empty and the note is empty; the thirteen seats are the rule from 'hand'; the fight is the one with no network",
                S.loaded.every((v) => v === true) && S.options.every((o) => o[0] === "" && o.slice(1, 4).join() === "rule,flyhand,mlphand" && o.length === 6) && S.plain.sel.join("|") === "rule|||" && S.plain.note === "" && S.plain.problems.length === 0 && got(S.plain) === want(() => ["hand", "rule"]) && same(S.plain.tally, plainT), got(S.plain).slice(0, 60));
            ok("!! THE TURRETS' AND THE POINT DEFENCE'S CONTROLS ARE THE FIGHT THE MODULE FLIES: the gate's own fruit fly in the three turrets and its GPU brain in the ten point-defence mounts give battleshipFight.fight()'s tally with seatNetworks { main, pd } in every count -- and not the rule's; the state says which seat has which and from where (the group), the selects agree and the ship's card says 'hands: turrets fly, PD mlp'",
                same(S.groups.tally, fightWith({ seatNetworks: { main: cwF, pd: cwM } })) && !same(S.groups.tally, plainT) && S.groups.tally.ship.seatRounds !== plainT.ship.seatRounds && got(S.groups) === want((id) => ["group", isMain(id) ? "fly" : "mlp"]) && S.groups.sel.join("|") === "rule|fly|mlp|" && /hands: turrets fly, PD mlp/.test(S.groups.card), `${S.groups.tally.ship.seatRounds} rounds against ${plainT.ship.seatRounds}`);
            ok("!! A SEAT'S OWN HAND BEATS ITS GROUP'S AND THE GROUP'S BEATS THE BASE: with the fruit fly (the gate's) as the hand, the GPU brain on hand weights for the turrets and 'main-a:flyhand pd-p1:mlp pd-p2:rule' in the seats field, main-a has the fruit fly on hand weights (from its seat), main-b and main-c the GPU brain (from the group), pd-p1 the gate's GPU brain, pd-p2 the RULE although the base is a network, the other eight point-defence mounts the base -- and the fight is the module's with exactly that seatNetworks",
                got(S.single) === want((id) => id === "main-a" ? ["seat", "flyhand"] : isMain(id) ? ["group", "mlphand"] : id === "pd-p1" ? ["seat", "mlp"] : id === "pd-p2" ? ["seat", "rule"] : ["network", "fly"])
                && same(S.single.tally, fightWith({ network: cwF, seatNetworks: { main: handM, "main-a": handF, "pd-p1": cwM, "pd-p2": null } })) && S.single.sel.join("|") === "fly|mlphand||main-a:flyhand pd-p1:mlp pd-p2:rule" && /hands: turrets mixed, PD mixed/.test(S.single.card), got(S.single).slice(0, 80));
            ok("!! 'THE RULE' IS A HAND TOO, FOR A GROUP AND FOR A SEAT: with the gate's fruit fly as the base, 'rule' for the point defence puts the rule in all ten mounts (the turrets keep the network), and 'pd-p2:rule' in the seats field puts it in that mount alone -- each the module's fight with that seatNetworks (null under the key), the card saying 'hands: turrets fly, PD rule' for the group",
                got(S.pdRule) === want((id) => isMain(id) ? ["network", "fly"] : ["group", "rule"]) && same(S.pdRule.tally, fightWith({ network: cwF, seatNetworks: { pd: null } })) && /hands: turrets fly, PD rule/.test(S.pdRule.card)
                && got(S.seatRule) === want((id) => id === "pd-p2" ? ["seat", "rule"] : ["network", "fly"]) && same(S.seatRule.tally, fightWith({ network: cwF, seatNetworks: { "pd-p2": null } })) && !same(S.pdRule.tally, S.seatRule.tally));
            ok("!! WHAT THE PAGE CANNOT MAKE SENSE OF IS SAID AND LEFT OUT, AND THE FIGHT STILL RUNS: 'main-z:fly pd-p1:nothing port:fly junk' names a seat that is not there, a hand that is not one, a side (not a group, not a seat) and a word with no colon -- four problems, each naming the word, in the state and in the note beside the field; no seat has anything but the rule and the fight is the one with no network (the build is never asked for a key it would refuse)",
                S.junk.problems.length === 4 && /"main-z" is not a seat/.test(S.junk.problems[0]) && /"nothing" is not a hand that is loaded/.test(S.junk.problems[1]) && /"port" is not a seat/.test(S.junk.problems[2]) && /"junk" is not seat:hand/.test(S.junk.problems[3]) && S.junk.problems.every((p) => S.junk.note.includes(p)) && got(S.junk) === want(() => ["hand", "rule"]) && same(S.junk.tally, plainT), S.junk.problems.join(" | "));
            const nOf = (k) => S.win[k].n.join(), hid = { true: "fly", false: "mlp" };
            ok("!! THE SHIP'S BRAIN WINDOW SHOWS THE NETWORK OF THE SEAT IT IS ON: with the gate's GPU brain as the hand and the gate's fruit fly for the turrets, the window on a turret (seats 1-3) grows the fruit fly's three rows -- 12 features, 34 hidden, 3 outputs, 17 rows in all -- and on each of the ten point-defence mounts the GPU brain's -- 12, 32, 3",
                S.win.length === 13 && S.win.every((w) => w.rows === 17) && [0, 1, 2].every((k) => nOf(k) === "12,34,3") && [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every((k) => nOf(k) === "12,32,3"), S.win.map((w) => w.n[1]).join(","));
            const hasNet = S.win.filter((w) => w.texts.some((t) => /^net:/.test(t)));
            ok("!! ...and the seat's own window says which hand it is working: wherever a seat's window says what its network did ('net: yaw ... trigger ...') it also says 'hand: fly' (a turret) or 'hand: mlp' (a mount), and at least one turret and one mount showed it at tick 300; a window with no network line has no hand line",
                hasNet.length >= 2 && hasNet.every((w) => w.texts.includes("hand: " + hid[w.k < 3])) && hasNet.some((w) => w.k < 3) && hasNet.some((w) => w.k >= 3) && S.win.filter((w) => !hasNet.includes(w)).every((w) => !w.texts.some((t) => /^hand:/.test(t))), hasNet.map((w) => w.k + 1).join(","));
            const c = S.ctl;
            ok("!! THE THREE CONTROLS START THE FIGHT THEY NAME: choosing flyhand for the turrets, then mlphand for the point defence, then 'pd-p1:rule' in the seats field each starts a new fight (the tick is back to 0) whose seats are those hands -- the turrets 'flyhand' from their group, the mounts 'mlphand' from theirs, and pd-p1 the rule from its seat",
                c.handMain.tick === 0 && c.handPd.tick === 0 && c.handSeats.tick === 0 && got(c.handMain) === want((id) => isMain(id) ? ["group", "flyhand"] : ["hand", "rule"]) && got(c.handPd) === want((id) => isMain(id) ? ["group", "flyhand"] : ["group", "mlphand"]) && got(c.handSeats) === want((id) => id === "pd-p1" ? ["seat", "rule"] : isMain(id) ? ["group", "flyhand"] : ["group", "mlphand"]) && c.handSeats.sel === "pd-p1:rule", got(c.handSeats).slice(0, 70));
            ok("!! THE URL CHOOSES THE HANDS: ?main=flyhand&pd=mlphand&seats=pd-p1:rule starts a fight whose turrets have the fruit fly on hand weights, whose mounts have the GPU brain on its, and whose pd-p1 has the rule, with the selects and the field saying so and no problem reported",
                got(S.url) === want((id) => id === "pd-p1" ? ["seat", "rule"] : isMain(id) ? ["group", "flyhand"] : ["group", "mlphand"]) && S.url.sel.join("|") === "rule|flyhand|mlphand|pd-p1:rule" && S.url.problems.length === 0);
        }
        // ==== SEATHANDS-END (node)

        // ==== SHIPFORM-BEGIN (node): the second ship in station and the ships that collide ----
        {
            const F = r.form, O = { fighters: 8, gunners: "regular", behaviour: "face", cruise: 0.3 }, G12 = { fighters: 12, gunners: "green" };
            const lib = (kind, seed, o) => BS.fight(seed, kind, o), hpOf = (t) => t.ships.map((q) => Math.round(q.hpLeft)).join();
            const L = { off: lib("beam", 1, { ...O, ships: 2 }), on: lib("beam", 1, { ...O, ships: 2, formation: true }), one: lib("beam", 1, O), pass: lib("stern", 8, { ...G12, ships: 2 }), hit: lib("stern", 8, { ...G12, ships: 2, shipCollisions: true }), both: lib("stern", 8, { ...G12, ships: 2, shipCollisions: true, formation: true }) };
            ok("!! THE FORMATION BOX IS THE FIGHT THE MODULE FLIES: with two ships the second keeps its station -- battleshipFight.fight()'s tally with formation in every count, the state says so, the box is ticked and the second ship's card says 'keeps its station on the battleship: n units from its slot'; the fight without it is the one with both ships facing, and its card says nothing of a station",
                same(F.on.tally, L.on) && F.on.formation === true && F.on.sel.join() === "true,false,2" && /keeps its station on the battleship: \d+\.\d units from its slot/.test(F.on.cards[2]) && same(F.off.tally, L.off) && F.off.formation === false && !F.off.cards.some((c) => /station/.test(c)) && !same(F.on.tally, F.off.tally) && hpOf(F.on.tally) === hpOf(L.on), `${F.on.tally.killed} down, ${hpOf(F.on.tally)} | ${F.off.tally.killed} down`);
            ok("!! A FORMATION WITH ONE SHIP IS NOTHING, AND THE PAGE DOES NOT FALL OVER: with the box ticked and one ship the fight is the one-ship fight (battleshipFight.fight() with no formation), the state says no formation although the box stays ticked, and no card speaks of a station", same(F.one.tally, L.one) && F.one.formation === false && F.one.ships === 1 && F.one.sel.join() === "true,false,1" && !F.one.cards.some((c) => /station/.test(c)));
            ok("!! THE SHIPS-COLLIDE BOX IS THE FIGHT WHERE THEY MEET: the stern attack of seed 8 (twelve fighters, green gunners, two ships) ends the ships on 1,500 and 1,320 without it and 1,450 and 1,270 with it -- the tallies of battleshipFight.fight() with and without shipCollisions in every count -- and the page's log says THE SHIPS COLLIDED twice with it (55.9 s and 56.9 s, 25 each) and never without; with the formation as well they never meet (294 and 1,338 left, no log line)",
                same(F.pass.tally, L.pass) && F.pass.hp.join() === "1500,1320" && F.pass.seen.length === 0 && same(F.hit.tally, L.hit) && F.hit.hp.join() === "1450,1270" && F.hit.shipCollisions === true && F.hit.seen.length === 2 && /^55\.9 s  THE SHIPS COLLIDED: battleship and second ship \(-25 each\)$/.test(F.hit.seen[0]) && /^56\.9 s  THE SHIPS COLLIDED/.test(F.hit.seen[1])
                && same(F.both.tally, L.both) && F.both.hp.join() === "294,1338" && F.both.seen.length === 0 && F.both.formation === true && F.both.sel.join() === "true,true,2", `${F.hit.seen.join(" | ")}`);
            ok("!! THE TWO BOXES START THE FIGHT THEY NAME, AND THE URL SETS THEM: ticking formation, then ships collide, each starts a new fight (the tick is back to 0) whose state says so; ?ships=2&formation=1&collide=1 starts a two-ship fight with both on and both boxes ticked",
                F.ctl.formation.tick === 0 && F.ctl.formation.formation === true && F.ctl.formation.sel === true && F.ctl.collide.tick === 0 && F.ctl.collide.shipCollisions === true && F.ctl.collide.sel === true && F.url.formation === true && F.url.shipCollisions === true && F.url.ships === 2 && F.url.sel.join() === "true,true,2");
        }
        // ==== SHIPFORM-END (node)

        // ---- 9d a second ship and an escort ----
        {
            const N = r.nb4, O = { fighters: 8, gunners: "regular", behaviour: "face", cruise: 0.3, ships: 2, escorts: 3 }, ref = BS.fight(1, "beam", O), refShipped = BS.fight(1, "beam", { ...O, pilot: SHIPPED });
            ok("!! A SECOND SHIP AND THREE ESCORTS ARE THE FIGHT THE MODULE FLIES: the page's beam attack with two ships and three escorts (seed 1, regular gunners) is battleshipFight.fight()'s with those options in every number the tally has -- both ships', the attackers', the escorts' -- and with the shipped pilot for the attackers it is that fight too (the escorts stay on the PD autopilot)",
                JSON.stringify(N.fight.tally) === JSON.stringify(ref) && JSON.stringify(N.shipped.tally) === JSON.stringify(refShipped) && ref.ships.length === 2 && ref.escorts.length === 3 && ref.fighters.length === 8 && JSON.stringify(ref) !== JSON.stringify(refShipped), `${ref.winner}, ${ref.ticks} ticks, ${ref.killed} shot down, ${ref.damageOnShips} damage on the ships`);
            ok("!! THERE IS A WINDOW FOR EVERY CRAFT AND A CARD FOR EVERY SIDE: thirteen windows (the first ship, eight attackers, the second ship, three escorts), the two ships' taller than the rest; four cards in the order ship, attackers, second ship, escorts (card0-card3), the second ship's and the escorts' named; the controls say 2 and 3",
                N.windows.length === 13 && N.shipBoxes.map((v, i) => v === (i === 0 || i === 9)).every(Boolean) && N.windows[0].rect.height > N.windows[1].rect.height * 1.5 && Math.abs(N.windows[9].rect.height - N.windows[0].rect.height) < 1 && N.cardIds.join() === "card0,card1,card2,card3" && /^battleship/.test(N.cards[0]) && /^8 fighters/.test(N.cards[1]) && /^second ship/.test(N.cards[2]) && /^3 escorts/.test(N.cards[3]) && /escort 1/.test(N.cards[3]) && N.ctrl.join() === "2,3", N.cards.map((c) => c.slice(0, 24)).join(" | "));
            const mk = N.markers, col = (i) => [mk.color[3 * i], mk.color[3 * i + 1], mk.color[3 * i + 2]], near3 = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-3);
            ok("!! THE DOTS IN THE BIG PICTURE KNOW THE SIDES: thirteen markers; both ships in the ship colour, the attackers orange, the escorts BLUE; the escorts' rounds are drawn apart (a tracer set of their own, seen in the first 10 s) and the ground fighters' glow hook counts only fighters (eleven)", mk.n === 13 && near3(col(0), [0.2, 1, 0.8]) && near3(col(9), [0.2, 1, 0.8]) && [1, 2, 3, 4, 5, 6, 7, 8].every((i) => near3(col(i), [1, 0.6, 0.2])) && [10, 11, 12].every((i) => near3(col(i), [0.4, 0.7, 1])) && N.tracers.some((t) => t.escort > 0) && N.tracers.some((t) => t.pd > 0) && N.glow === 11, `escort tracers ${N.tracers.map((t) => t.escort).join(",")}`);
            ok("!! THE SECOND SHIP IS ITS OWN SHIP ON THE PAGE: six rounds dropped on its engine pod 2 put THAT pod out on THAT ship (its drawing dark, the first ship's three still lit; two engines running on it, three on the first), the log says which ship ('engine pod 2 OUT [second ship]'), its card lists the part and the first ship's says none; its brain window is the hull's row and its thirteen seats' (14 rows), an escort's is the PD autopilot's (twelve features, five commands)",
                N.engine.s1.map((e) => e.out).join() === "false,true,false" && N.engine.s0.every((e) => !e.out) && N.engine.running.join() === "3,2" && N.engine.log.some((l) => /engine pod 2 OUT \[second ship\]/.test(l)) && /parts out: engine pod 2/.test(N.engine.cards[2]) && /parts out: none/.test(N.engine.cards[0]) && N.engine.seatsB === 13 && N.brainB.length === 14 && N.brainB[0].n === 7 && N.brainE.length === 2 && N.brainE[0].n === 12 && N.brainE[1].n === 5 && N.labels[9] !== N.labels[0] && /second ship/.test(N.labels[9]) && /escort 1/.test(N.labels[10]), N.labels.slice(9, 11).join(" | "));
            const U = N.ui, fightU = BS.fight(1, "beam", { fighters: 8, gunners: "regular", behaviour: "face", cruise: 0.3, ships: 2, escorts: 2, network: { module: MG, weights: MG.handWeights() } });
            ok("!! EVERY NEW CONTROL IS THE FIGHT THAT RUNS: the ships set to 2, the escorts to 2 and the hand to the GPU brain's hand weights with the New fight button pressed is battleshipFight.fight()'s with those options in every number, the controls and the state say the same; and a change of any of the three starts the fight again from tick 0 with what it says (13 -> 10 -> 13 -> 13 craft: 2 ships, then 3 escorts, then the hand)",
                same(U.tally, fightU) && JSON.stringify(U.tally) === JSON.stringify(fightU) && U.sel.join() === "2,2,mlphand" && U.state.ships === 2 && U.state.escorts === 2 && U.state.hand.id === "mlphand" && N.change.nships.tick === 0 && N.change.nships.crafts === 10 && N.change.nships.ships === 2 && N.change.nesc.tick === 0 && N.change.nesc.crafts === 13 && N.change.nesc.escorts === 3 && N.change.hand.tick === 0 && N.change.hand.hand === "flyhand" && N.change.hand.crafts === 13, `${U.sel.join()} ${Object.values(N.change).map((c) => c.crafts).join(",")}`);
            ok("!! THE WINDOWS ARE SIZED FOR THE SHIPS THERE ARE: a second ship counts as two craft more, so two ships and four attackers fit the stack of a page 1,250 px high to within the few pixels of the stack's own padding (windows 148 high; sized for one ship they would be 160 and overflow by about a hundred) -- the formula is the number of craft plus the number of ships", N.fit.windows === 6 && N.fit.scrollHeight <= N.fit.clientHeight + 8, JSON.stringify(N.fit));
            ok("and an escort's brain window says whose pilot it shows -- the PD autopilot's, marked as the escort's -- not the attackers' pilot (the attackers here fly the PD autopilot too, so the title is the only thing that tells)", N.brainEtexts.some((t) => /escort 1 · PD autopilot \(escort\)/.test(t)), N.brainEtexts.join(" | ").slice(0, 120));
            ok("and a network in the seats is in the SECOND ship's too: with the GPU brain for the hand its brain window grows the three network rows (17 rows), for the seat ITS OWN window is on (the fourth: s4), not the first ship's window's (the first)", N.brainNet === 17 && N.brainNetLabels.every((l) => /^s4 /.test(l)), String(N.brainNet) + " " + N.brainNetLabels.join());
        }

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
