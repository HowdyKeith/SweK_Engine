// WebGLEngine/tools/ship/spaceDuelPage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/spaceDuelPage-selfcheck.mjs      (about a minute; needs the headless browser the other page gates use. SWEK_DUEL_SHOT=<dir> also writes two pictures of the page's canvas there, for a person to look at: nothing reads them.)
//
// space-duel.html REALLY IS THE FIGHT IT SAYS. The page is the drawing and the controls over render/spaceDuelCore.mjs (which render/spaceDuelCore-selfcheck.mjs holds in node); this loads the page in a real browser, in an iframe of the engine's own origin, and holds what only a page can get wrong:
//
//   1  IT BOOTS              the brain files the core names are loaded with no error, the default fight is built (the car's untrained gunner against the GPU Brain's) and runs; the notes under the controls say what each chosen hand and helm is NOT
//   2  ITS FIGHT IS THE DUEL three fights chosen through the page's own controls and run to their end have the fingerprint, scores, winner and peak of networks that the core gives IN THE SAME BROWSER for the same choices, imported apart from the page; the verdict line says them.
//                            NOT node's: found on the first run of this gate -- Chrome 153's Math.log and Math.pow differ from node 22's in the last place, the sight's noise is drawn through Math.log, and two of three fights had another fingerprint in the browser. So a fight is the same fight within ONE engine, the gate
//                            compares within one, and it prints (without asserting) how many of the three agree with node
//   3  THE CONTROLS ARE THE FIGHT what newFight() builds is what the selects, numbers and boxes say, clamped to what a fight allows
//   4  THE DRAWING IS THE STATE each hull is where its craft is, turned as it is turned; a barrel runs from its seat's mount along where the seat points; a ring stands at a seat a NETWORK works and at no other; a destroyed ship is drawn dark; one object a craft
//   5  THE PANELS            thirteen seat rows a ship, `network` where a network works the seat and `rule` where none does, the hit points and the networks seated the fight's own
//   7  A PEER'S BRAIN FILES   given to a side the way the file button gives them: they take the seats and the escorts they have a brain for, the fight is the core's own for the same files, each file's fate is listed under the controls, and `clear` forgets them
//   6  A FIGHT THAT CANNOT BE BUILT is said: with a brain file taken away, choosing the hand that needs it names the file and builds nothing
//
// SABOTAGE LOG: (18 mutants, each written into space-duel.html itself, the gate run in the browser, the page restored byte for byte; the number is how many rows went red):
//   G1 the page ignores side B's hand 7 | G2 the seed is not read 5 | G3 the ships are not clamped 1 | G4 the quaternion is set in the arena's order 1 | G5 a barrel points along the seat's rest 1 | G6 every barrel is nine units 1 | G7 a ring at every seat 1 | G8 a destroyed ship keeps its colour 1
//   G9 the panel says network in every seat 1 | G10 a fight that cannot be built keeps the old one 1 | G12 the fight starts paused 2 | G13 the notes are side A's twice 1 | G14 the fish's file is not fetched 1 (the page did not boot: red by the boot row)
//   (G11, the verdict without the fingerprint, was written and did NOT APPLY -- its text did not match the page's -- so it is not counted and that clause of section 2 is unsabotaged.)
//   AND FIVE ON THE PEER FILES (section 7), all red: H1 the choice does not carry the peer files 2 | H2 clear does not forget 1 | H3 side A's peer lines are not shown 1 | H4 a side's files go to the other side 2 | H5 the lines are dropped 1
// None went 0 red. WHAT THE FIRST RUNS OF THIS GATE FOUND, before any sabotage: the page did not load at all (OrbitControls imports "three" and the page had no import map); two of three fights were not node's (Math.log, above); and the first camera this page shipped with showed an empty sky, both ships just
// outside the frame -- found by LOOKING at the picture SWEK_DUEL_SHOT writes, which no row reads. NOT CHECKED: that anything is in the frame (no row looks at pixels), the orbit controls, the layout at a phone's width, the cannon's beam, the page on a real GPU, and the FILE BUTTON itself (section 7 hands the files to the function the button's handler calls; no file dialog is opened).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import * as C from "../../render/spaceDuelCore.mjs";
import * as CS from "../../physics/mechanics/capitalShip.mjs";
import * as GS from "../../physics/mechanics/gunSeats.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const files = Object.fromEntries(Object.entries(C.FILES).map(([k, f]) => [k, JSON.parse(fs.readFileSync(path.join(ENG, f.path), "utf8"))]));
const SETUPS = [
    { seed: 2, kind: "crossing", ships: 1, escorts: 0, a: { hand: "car", helm: "face", gunners: "regular", cannon: true }, b: { hand: "gpu", helm: "face", gunners: "regular", cannon: true } },
    { seed: 3, kind: "broadside", ships: 2, escorts: 3, a: { hand: "car-trained", helm: "trained", gunners: "green", cannon: true }, b: { hand: "fish", helm: "broadside", gunners: "regular", cannon: false } },
    { seed: 5, kind: "chase", ships: 1, escorts: 0, a: { hand: "rule", helm: "broadside", gunners: "perfect", cannon: false }, b: { hand: "fly", helm: "face", gunners: "ace", cannon: true } },
];
const PEER = [{ name: "rig-gunner.json", text: JSON.stringify(files.gpu) }, { name: "broken.json", text: "{not json" }, { name: "mac-pilot.json", text: fs.readFileSync(path.join(ENG, "brain", "pilot6dofWeightsDefault-d18.json"), "utf8") }, { name: "copy.json", text: JSON.stringify(files.gpu) }];
const nodeEnd = (setup) => { const f = C.createFight(setup, files); while (!f.done) f.step(100); const s = f.snapshot(); return { fingerprint: s.fingerprint, scores: s.scores, winner: s.winner, peak: s.brains.peak, seated: s.brains.seated, ticks: s.ticks }; };

console.log("spaceDuelPage-selfcheck -- space-duel.html really is the fight it says\n");
const skip = webgpuSkipReason(createRequire(import.meta.url));
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. ***"); fails++; }
else {
    const run = await runInEngineOrigin({
        engineRoot: ENG, timeoutMs: 400000, args: { SETUPS, PEER },
        script: `async (args) => {
            const f = document.createElement("iframe"); f.style.width = "1500px"; f.style.height = "900px"; f.src = "/space-duel.html"; document.body.appendChild(f);
            await new Promise((res) => { f.onload = res; });
            const win = f.contentWindow, doc = win.document, wait = (ms) => new Promise((res) => setTimeout(res, ms)), t0 = performance.now();
            while (performance.now() - t0 < 60000 && !(win.__duel && win.__duel.ready)) await wait(200);
            if (!(win.__duel && win.__duel.ready)) return { booted: false };
            const U = win.__duel, $ = (id) => doc.getElementById(id), out = { booted: true };
            await wait(500);
            out.boot = { fileErrors: U.fileErrors, files: Object.keys(U.files).sort(), setup: U.setupNow(), ticksAfterHalfASecond: U.fight.snapshot().ticks, drawn: U.drawnCount(), notes: $("notes").textContent, status: $("status").textContent, seated: U.fight.snapshot().brains.seated };
            U.pause(); out.shot1 = U.shot();
            const apply = (s) => { $("seed").value = s.seed; $("kind").value = s.kind; $("ships").value = s.ships; $("escorts").value = s.escorts; for (const [k, c] of [["A", s.a], ["B", s.b]]) { $("hand" + k).value = c.hand; $("helm" + k).value = c.helm; $("gunners" + k).value = c.gunners; $("cannon" + k).checked = c.cannon; } };
            out.fights = [];
            for (const s of args.SETUPS) {
                apply(s); $("newBtn").click(); const built = U.setupNow(), fight = U.fight; fight.step(40);
                const mid = fight.snapshot(); U.redraw();
                const cap = mid.crafts.find((c) => c.kind === "capital" && c.team === 1), capB = mid.crafts.find((c) => c.kind === "capital" && c.team === 2);
                const drawing = { drawn: U.drawnCount(), crafts: mid.crafts.length, poseA: U.poseOf(cap.id), stateA: { pos: cap.pos, q: cap.q }, barrels: cap.seats.map((q, i) => ({ yaw: q.yaw, pitch: q.pitch, line: U.barrelOf(cap.id, i), ring: U.ringVisible(cap.id, i), net: q.net, working: q.working })), ringsB: capB.seats.map((q, i) => ({ ring: U.ringVisible(capB.id, i), net: q.net, working: q.working })) };
                const panel = { a: $("panelA").textContent, b: $("panelB").textContent, rowsA: $("panelA").querySelectorAll("tr").length, netA: $("panelA").querySelectorAll("td.net").length, ruleA: $("panelA").querySelectorAll("td.rule").length, netB: $("panelB").querySelectorAll("td.net").length, hp: mid.hp, seated: mid.brains.seated };
                while (!fight.done) fight.step(200);
                U.redraw(); const end = fight.snapshot(), dead = end.crafts.find((c) => c.kind === "capital" && c.dead);
                out.fights.push({ built, drawing, panel, end: { fingerprint: end.fingerprint, scores: end.scores, winner: end.winner, peak: end.brains.peak, seated: end.brains.seated, ticks: end.ticks }, verdict: $("verdict").textContent, status: $("status").textContent, deadHull: dead ? U.poseOf(dead.id).hull : null, afterDone: fight.step(5) });
            }
            out.shot2 = U.shot();
            // THE SAME FIGHTS, NOT THROUGH THE PAGE: the core imported here, in this browser, with the files the page loaded, run to their end
            const C2 = await import("/render/spaceDuelCore.mjs");
            out.expected = args.SETUPS.map((s) => { const f = C2.createFight(s, U.files); while (!f.done) f.step(100); const e = f.snapshot(); return { fingerprint: e.fingerprint, scores: e.scores, winner: e.winner, peak: e.brains.peak, seated: e.brains.seated, ticks: e.ticks }; });
            out.mathProbe = [Math.log(0.37), Math.pow(1.7, 2.2)];
            // the controls are clamped
            $("ships").value = 9; $("escorts").value = 99; $("seed").value = -4; out.clamped = U.setupNow();
            // a fight that cannot be built
            apply(args.SETUPS[0]); const kept = U.files.fish; delete U.files.fish; $("handB").value = "fish"; $("newBtn").click();
            out.refused = { fight: U.fight === null, error: U.error, status: $("status").textContent, drawn: U.drawnCount(), panel: $("panelA").textContent };
            U.files.fish = kept; $("newBtn").click(); out.recovered = { fight: U.fight !== null, error: U.error };
            // a peer's files, given to side A the way the file button gives them
            apply(args.SETUPS[2]); $("escorts").value = 2;
            U.setPeers("A", args.PEER); const fp = U.fight; fp.step(30); U.redraw(); const sp = fp.snapshot(), capA = sp.crafts.find((c) => c.kind === "capital" && c.team === 1);
            out.peer = { names: U.peersOf("A"), count: $("peerCountA").textContent, notes: $("notes").textContent, seated: sp.brains.seated, nets: capA.seats.filter((q) => q.net).length, rings: capA.seats.filter((q, i) => U.ringVisible(capA.id, i)).length, netCells: $("panelA").querySelectorAll("td.net").length, setup: U.setupNow().a };
            const C3 = await import("/render/spaceDuelCore.mjs"), fe = C3.createFight({ ...args.SETUPS[2], escorts: 2, a: { ...args.SETUPS[2].a, peer: args.PEER } }, U.files); while (!fe.done) fe.step(100); while (!fp.done) fp.step(100);
            out.peer.same = fp.snapshot().fingerprint === fe.snapshot().fingerprint;
            $("peerClearA").click(); out.peerCleared = { names: U.peersOf("A"), seated: U.fight.snapshot().brains.seated, notes: $("notes").textContent, count: $("peerCountA").textContent };
            return out;
        }`,
    });
    const r = run.result;
    if (!run.ok || !r || !r.booted) { ok("!! the page booted in the browser", false, JSON.stringify({ ok: run.ok, reason: run.reason, errors: (run.pageErrors || []).slice(0, 3), result: r }).slice(0, 600)); }
    else {
        if (process.env.SWEK_DUEL_SHOT) for (const k of ["shot1", "shot2"]) fs.writeFileSync(path.join(process.env.SWEK_DUEL_SHOT, `space-duel-${k}.png`), Buffer.from(r[k].split(",")[1], "base64"));
        console.log("1. IT BOOTS");
        ok("!! no page error; the brain files the core names are all loaded, none refused; the default fight is the car's untrained gunner against the GPU Brain's, head-on, seed 1, one ship a side, and it is RUNNING (ticks have passed by half a second)", (run.pageErrors || []).length === 0 && r.boot.fileErrors.length === 0 && r.boot.files.join() === Object.keys(C.FILES).sort().join() && r.boot.setup.a.hand === "car" && r.boot.setup.b.hand === "gpu" && r.boot.setup.kind === "head-on" && r.boot.setup.seed === 1 && r.boot.setup.ships === 1 && r.boot.ticksAfterHalfASecond > 5 && r.boot.drawn === 2 && r.boot.seated.join() === "13,13", `${r.boot.ticksAfterHalfASecond} ticks; ${(run.pageErrors || []).slice(0, 2).join(" | ")}`);
        ok("the notes under the controls say what each chosen hand and helm is NOT, from the core's own catalogue, and the status line counts the live brains", r.boot.notes.includes(C.HANDS.find((h) => h.id === "car").note) && r.boot.notes.includes(C.HANDS.find((h) => h.id === "gpu").note) && r.boot.notes.includes(C.HELMS.find((h) => h.id === "face").note) && /live brains: \d+ asked this tick, peak \d+, of 26 seated/.test(r.boot.status));
        console.log("2. ITS FIGHT IS THE DUEL");
        r.fights.forEach((f, i) => { const n = r.expected[i]; ok(`!! fight ${i + 1} (${SETUPS[i].kind}, seed ${SETUPS[i].seed}, ${SETUPS[i].ships}+${SETUPS[i].escorts} a side, ${SETUPS[i].a.hand}/${SETUPS[i].a.helm} against ${SETUPS[i].b.hand}/${SETUPS[i].b.helm}), chosen through the page's controls and run to its end, is THE CORE'S OWN FIGHT IN THE SAME BROWSER (the core imported apart from the page, the same choices): the fingerprint, the scores, the winner, the peak and the networks seated; the verdict line says the winner and the fingerprint; a finished fight steps no further`, JSON.stringify(f.end) === JSON.stringify(n) && f.verdict.includes(n.fingerprint) && f.verdict.includes(n.winner === "draw" ? "A DRAW" : `SIDE ${n.winner} WINS`) && f.afterDone === 0, `${n.fingerprint}, ${n.winner}, peak ${n.peak} of ${n.seated[0] + n.seated[1]}`); });
        const sameAsNode = r.fights.map((f, i) => f.end.fingerprint === nodeEnd(SETUPS[i]).fingerprint), probe = [Math.log(0.37), Math.pow(1.7, 2.2)];
        console.log(`  ----  NOT ASSERTED, SAID: against NODE's fight of the same choices ${sameAsNode.filter(Boolean).length} of 3 fingerprints agree. This browser's Math.log(0.37) ${r.mathProbe[0] === probe[0] ? "is" : "is NOT"} node's and its Math.pow(1.7, 2.2) ${r.mathProbe[1] === probe[1] ? "is" : "is NOT"}: the sight's noise is drawn through Math.log, so a fight is the same fight only within one engine`);
        console.log("3. THE CONTROLS ARE THE FIGHT");
        ok("what the page built is what its controls said, for all three fights", r.fights.every((f, i) => JSON.stringify(f.built) === JSON.stringify(SETUPS[i])));
        ok("nine ships, ninety-nine escorts and a seed of -4 are clamped to four, twelve and 1", r.clamped.ships === 4 && r.clamped.escorts === 12 && r.clamped.seed === 1);
        console.log("4. THE DRAWING IS THE STATE");
        const SHIP = CS.createCapitalShip(), close = (a, b, tol = 1e-4) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
        ok("!! at tick 40 of each fight: one object a craft; ship A's hull is where the craft is and turned as it is (the arena's [w, x, y, z])", r.fights.every((f) => f.drawing.drawn === f.drawing.crafts && close(f.drawing.poseA.pos, f.drawing.stateA.pos) && (close(f.drawing.poseA.q, f.drawing.stateA.q) || close(f.drawing.poseA.q, f.drawing.stateA.q.map((v) => -v)))));
        ok("!! every barrel runs from its seat's mount along where the seat POINTS (gunSeats.dirAt of the seat's own yaw and pitch): nine units for a main turret, four for a point-defence mount", r.fights.every((f) => f.drawing.barrels.every((b, i) => { const seat = SHIP.seats[i], d = GS.dirAt(seat, b.yaw, b.pitch), len = seat.id.startsWith("main") ? 9 : 4; return close(b.line.slice(0, 3), seat.mount) && close(b.line.slice(3), seat.mount.map((v, k) => v + d[k] * len)); })) && r.fights.some((f) => f.drawing.barrels.some((b) => Math.abs(b.yaw) > 0.05)));
        ok("!! a ring stands at every working seat a NETWORK works and at no other: all thirteen of the car's and of the trained car's, none of the hand gunner's (fight 3's side A), and side B's the same way", r.fights.every((f) => f.drawing.barrels.every((b) => b.ring === (b.net && b.working)) && f.drawing.ringsB.every((b) => b.ring === (b.net && b.working))) && r.fights[0].drawing.barrels.filter((b) => b.ring).length === 13 && r.fights[2].drawing.barrels.filter((b) => b.ring).length === 0 && r.fights[2].drawing.ringsB.filter((b) => b.ring).length >= 10);
        ok("a destroyed ship is drawn dark", r.fights.filter((f) => f.deadHull !== null).length >= 2 && r.fights.every((f) => f.deadHull === null || f.deadHull === 0x222831));
        console.log("5. THE PANELS");
        ok("!! thirteen seat rows and a heading row for each ship; `network` in every seat a network works and `rule` in the others (13 and 0 for the car's side, 0 and 13 for the hand gunner's, 26 for two ships of the trained car's); the hit points and the networks seated are the fight's own", r.fights[0].panel.rowsA === 14 && r.fights[0].panel.netA === 13 && r.fights[0].panel.ruleA === 0 && r.fights[2].panel.netA === 0 && r.fights[2].panel.ruleA === 13 && r.fights[1].panel.rowsA === 28 && r.fights[1].panel.netA === 26 && r.fights[1].panel.netB === 26
            && r.fights.every((f) => f.panel.a.includes(`hit points ${f.panel.hp[0]} of`) && f.panel.a.includes(`networks seated ${f.panel.seated[0]}`) && f.panel.b.includes(`networks seated ${f.panel.seated[1]}`)) && r.fights[1].panel.a.includes("escorts") && r.fights[1].panel.b.includes("no cannon") && r.fights[1].panel.seated.join() === "28,26");
        console.log("6. A FIGHT THAT CANNOT BE BUILT");
        ok("!! with the fish's file taken away, choosing the fish names the file in the status line, builds no fight and draws nothing; with the file back the same choice builds", r.refused.fight && /seatGunnerFishWeightsDefault\.json was not loaded/.test(r.refused.error) && r.refused.status.includes("this fight cannot be built") && r.refused.status.includes("seatGunnerFishWeightsDefault.json") && r.refused.drawn === 0 && r.refused.panel === "" && r.recovered.fight && r.recovered.error === "");
        console.log("7. A PEER'S BRAIN FILES");
        ok("!! four files given to side A (a gunner, a broken file, a pilot, a copy of the gunner) over a side whose seats were the hand gunner's: the gunner's brain is in all thirteen seats (the snapshot, the rings and the panel agree), the pilot's flies the two escorts -- 15 networks seated where there were none -- and the fight is the core's own for the same files", r.peer.names.join() === "rig-gunner.json,broken.json,mac-pilot.json,copy.json" && r.peer.seated[0] === 15 && r.peer.nets === 13 && r.peer.rings === 13 && r.peer.netCells === 13 && r.peer.same && r.peer.setup.peer.length === 4 && r.peer.setup.hand === "rule", `seated ${r.peer.seated}`);
        ok("!! each file's fate is under the controls: SEATED with what it works for the gunner and the pilot, REFUSED with the reason for the broken file (not JSON) and the copy (a duplicate, naming the first); the count beside the button says four files", /SEATED\s+rig-gunner\.json: seatGunnerMlp, seat -- 13 seats/.test(r.peer.notes) && /SEATED\s+mac-pilot\.json: pilot6dofPolicy, pilot/.test(r.peer.notes) && /REFUSED\s+broken\.json: not JSON/.test(r.peer.notes) && /REFUSED\s+copy\.json: the same weights as rig-gunner\.json/.test(r.peer.notes) && r.peer.count === "4 files");
        ok("`clear` forgets them: no file, no line, no count, and the side is the hand gunner's again (no network seated)", r.peerCleared.names.length === 0 && r.peerCleared.seated[0] === 0 && !/SEATED|REFUSED/.test(r.peerCleared.notes) && r.peerCleared.count === "");
    }
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
