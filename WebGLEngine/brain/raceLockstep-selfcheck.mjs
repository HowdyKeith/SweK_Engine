// WebGLEngine/brain/raceLockstep-selfcheck.mjs -- v4681 (beside brain/raceLockstep.mjs)
//
// Run: node brain/raceLockstep-selfcheck.mjs
//
// THE RACE AS A LOCKSTEP SESSION, two peers in one process over a laggy mock wire, EACH WITH ITS OWN INSTANCE OF THE box3d WASM (the factory is called
// twice: two independent memories and worlds, which is the nearest one process gets to two). Peer A owns cars 0 and 2, peer B car 1; they exchange their
// policies' commands ahead by the input delay and step the race -- three cars, turrets, shells, slicks, pickups, and the real city with a scripted
// demolition (the biggest building brought down by shells, the block that falls out of it hit and chipped by one more, coming to rest and shattering) --
// when they hold every peer's commands for the tick.
//
// Section 1: they stay in lockstep (every confirmed tick one hash on both peers, no desync, the input lead near the delay), the cars were really
// commanded by their owners, and the demolition happened on both. Section 2: the commands they agreed on, fed to raceWithGunners as a replay log on a
// THIRD wasm instance, reach the same fingerprint -- the lockstep is the replay contract with the log arriving live. Section 3: a real divergence (one peer
// steps different commands at tick 100) is found by the hash exchange AT tick 100. Section 4: a wire that loses 5% of its messages still plays (the net's
// redundancy), and the sim neither stalls nor diverges. Section 5: the engine is part of the protocol -- a peer announcing another engine halts the
// pair before a step. Section 6: the contract's small guards -- a car nobody owns coasts, a peer hash that arrives before we have stepped is kept and
// compared, the timestep is locked.
//
// SABOTAGE LOG -- v4681, each applied to brain/raceLockstep.mjs, the gate run, the file restored.
//   A  a peer stepping ITS OWN policies' answer for the other peer's cars instead of what came over the wire   -> 7 red: the hashes (it computes the other peer's commands
//      from a fresher state than the owner did, input delay and all), the owners row, the hits, the divergence rows, the lossy wire. The policies are deterministic, so a peer
//      that ignored the wire would agree with the owner exactly if there were no input delay; the delay is what makes the exchange load-bearing.
//   B  a peer hash that arrives before we have stepped that tick dropped instead of kept (the ship session's way)   -> 1 red: section 6's early-hash row.
//   C  the timestep not locked (any dt accepted)                                                                     -> 1 red: section 6's dt row.
//   D  peer hashes never compared (checkPeerHash a no-op)                                                            -> 2 red: the divergence at tick 100, and the early-hash row.
//   FINDING: box3d's wasm keeps ONE world per module instance, so two peers in one process need two instances; box3dNode.initNode caches one, and the factory it
//   calls can be called again -- which this gate does, giving each peer (and the replay) its own memory and its own world.
"use strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { initNode, mod, VENDOR_DIR } from "../physics/box3d/box3dNode.mjs";
import { worldFromModule } from "../render/slugTicker.mjs";
import * as G from "./gunnerPolicy.mjs";
import * as D from "./drivePolicy.mjs";
import * as BT from "../world/buildingTopple.mjs";
import * as C from "../physics/raceCar.mjs";
import { createRacePeer, createRaceSession, NEUTRAL } from "./raceLockstep.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);
const log0 = console.log; console.log = (...a) => { if (!/\[CityGen\]|\[box3d\]|\[GLBParser\]/.test(String(a[0]))) log0(...a); };

const st = await initNode(); if (!st.ready) { ok("box3d's wasm", false, st.reason); process.exit(1); }
// a fresh, independent instance of the wasm (initNode caches ONE): the same factory the node loader uses, called again
const factory = (await import(pathToFileURL(path.join(VENDOR_DIR, "box3d.js")).href)).default;
const newModule = () => factory({ locateFile: (f) => pathToFileURL(path.join(VENDOR_DIR, f)).href });
const SECONDS = 12, TICKS = Math.round(SECONDS / C.CAR.dt);
const drivers = [D.handWeights(), D.handWeights({ speed: 0.8 }), D.zeroWeights()], gunners = [G.handWeights(), G.handWeights(), G.zeroWeights()];
const demolition = () => { let s = null; return { script: (t, ctx) => { if (!s) s = BT.demolitionScript(ctx.cityCtx); s(t, ctx); } }; };
const OWNER = { 0: "A", 1: "B", 2: "A" };

/** two peers, each on its own wasm, a mock wire that delivers `lat` rounds later (and drops what `lose(i)` says), and a round() that delivers and pumps */
async function twoPeers({ lat = 2, lose = null, tamperB = null, backendB = null, owner = OWNER } = {}) {
    const mA = await newModule(), mB = await newModule(), fleet = D.machineFingerprint(mA);
    const q = { A: [], B: [] }; let clock = 0, sent = 0, dropped = 0;
    const sendFrom = (from) => (msg) => { sent++; if (lose && lose(sent)) { dropped++; return; } q[from === "A" ? "B" : "A"].push({ msg: JSON.parse(JSON.stringify(msg)), due: clock + lat }); };
    const mk = (id, m, extra) => createRacePeer({ selfId: id, peers: ["A", "B"], owner, worldFrom: () => worldFromModule(m, [0, -9.81, 0]), drivers, gunners, seed: 1, seconds: SECONDS, fleet, city: demolition(), send: sendFrom(id), backendId: fleet, inputDelay: 4, ...extra });
    const A = mk("A", mA, {}), B = mk("B", mB, { tamper: tamperB, backendId: backendB || fleet });
    function round() {
        for (const [id, p] of [["A", A], ["B", B]]) { const due = q[id].filter((e) => e.due <= clock); q[id] = q[id].filter((e) => e.due > clock); for (const e of due) p.receive(e.msg); }
        A.pump(); B.pump(); clock++;
    }
    return { A, B, round, fleet, stats: () => ({ sent, dropped, clock }) };
}
const common = (a, b) => Math.min(a.session.tick, b.session.tick);
const sameHashes = (a, b, n) => { for (let t = 0; t < n; t++) if ((a.session.localHash(t) >>> 0) !== (b.session.localHash(t) >>> 0)) return t; return -1; };

sec("1. TWO PEERS, ONE RACE: each owns its cars, steps the other's commands off the wire, and the hashes agree on every confirmed tick");
let main;
{
    main = await twoPeers({ lat: 2 });
    const t0 = Date.now(); for (let r = 0; r < TICKS + 200 && common(main.A, main.B) < TICKS; r++) main.round();
    const n = common(main.A, main.B), bad = sameHashes(main.A, main.B, n), a = main.A.session, b = main.B.session;
    report(`${n} ticks in ${Date.now() - t0} ms over ${main.stats().clock} rounds; fingerprint A ${a.localHash(n - 1).toString(16)} B ${b.localHash(n - 1).toString(16)}; lead A ${main.A.net.lead()} B ${main.B.net.lead()}; ownership A ${a.ownedBy("A")} B ${a.ownedBy("B")}`);
    ok("!! both peers confirmed the whole race (12 s) over a wire that takes two rounds, and every confirmed tick has ONE hash on both -- a running fingerprint of box3d's state, the turrets, the shells, the slicks, the pickups, the city's hit points and the falling block", n >= TICKS && bad === -1, `${n} ticks, first differing tick ${bad}`);
    ok("...neither peer flagged a desync, and the input lead hovers near the delay (not a runaway)", !a.desync() && !b.desync() && main.A.net.lead() <= 7 && main.B.net.lead() <= 7, `lead ${main.A.net.lead()} / ${main.B.net.lead()}`);
    ok("!! the cars were commanded by their OWNERS: A's policies drove cars 0 and 2, B's drove car 1, and the commands each stepped are the ones the owner sent (identical logs on both peers)", JSON.stringify(a.log.slice(0, n)) === JSON.stringify(b.log.slice(0, n)) && a.ownedBy("A").join() === "0,2" && a.ownedBy("B").join() === "1" && a.log[200][1].throttle !== a.log[200][2].throttle, `A owns ${a.ownedBy("A")}, B owns ${a.ownedBy("B")}`);
    const rc = a.race, rb = b.race;
    ok("the race is a race: the hand gunners hit each other on both peers, the zero gunner never fires", rc.turrets[0].hits + rc.turrets[1].hits > 0 && rc.turrets[2].shots === 0 && rc.turrets.map((t) => t.hits).join() === rb.turrets.map((t) => t.hits).join(), `hits ${rc.turrets.map((t) => t.hits + "/" + t.shots).join(" ")}`);
    const ct = rc.cityCtx.topple, cb = rb.cityCtx.topple;
    ok("!! the demolition happened on BOTH peers, the same way: a building toppled into a body, the shell dropped on it chipped it, it came to rest and shattered -- the same events, the same rubble, the same chips", ct.fallen === 1 && ct.shattered === 1 && ct.chipped > 0 && ct.rubble > 0 && JSON.stringify(ct.events.map((e) => e.kind + "@" + (e.at ?? ""))) === JSON.stringify(cb.events.map((e) => e.kind + "@" + (e.at ?? ""))) && ct.rubble === cb.rubble && ct.chipped === cb.chipped, `fallen ${ct.fallen}, shattered ${ct.shattered}@${(ct.events.find((e) => e.kind === "shatter") || {}).at}, chipped ${ct.chipped}, rubble ${ct.rubble}`);
}

sec("2. THE COMMANDS THEY AGREED ON ARE A REPLAY LOG: fed to raceWithGunners on a third wasm, the same fingerprint");
{
    const a = main.A.session, n = common(main.A, main.B), mC = await newModule();
    const zeros = drivers.map(() => D.zeroWeights()), zg = drivers.map(() => G.zeroWeights());
    const rep = G.raceWithGunners(() => worldFromModule(mC, [0, -9.81, 0]), zeros, zg, { seed: 1, seconds: n * C.CAR.dt, fleet: main.fleet, inputsLog: a.log.slice(0, n), city: demolition() });
    report(`lockstep ${a.localHash(n - 1).toString(16).padStart(8, "0")} / replay ${rep.fingerprint}`);
    ok("!! the log the peers agreed on, replayed offline with NO policies on a third engine instance, reaches the lockstep's own fingerprint -- the live exchange and the recorded replay are one contract", rep.fingerprint === (a.localHash(n - 1) >>> 0).toString(16).padStart(8, "0"), `${rep.fingerprint}`);
}

sec("3. A REAL DIVERGENCE: one peer steps different commands at tick 100 -- the hash exchange finds it AT tick 100");
{
    const P = await twoPeers({ lat: 2, tamperB: (t, rec) => (t === 100 ? rec.map((r, i) => (i === 1 ? { ...r, throttle: r.throttle * 0.5 } : r)) : rec) });
    for (let r = 0; r < 400; r++) P.round();
    const d = P.A.session.desync() || P.B.session.desync();
    report(`desync ${JSON.stringify(d)}`);
    ok("!! the hash exchange catches a divergence at the tick it begins: the first disagreeing tick is 100, on whichever peer saw the other's hash second", !!d && d.tick === 100, d ? `tick ${d.tick}, peer ${d.peer}` : "none");
    ok("...and the first differing tick in the hashes is 100 too (nothing earlier disagreed)", sameHashes(P.A, P.B, Math.min(P.A.session.tick, P.B.session.tick)) === 100);
}

sec("4. A LOSSY WIRE: 5% of the messages vanish; the redundant inputs carry the sim through");
{
    let k = 0; const P = await twoPeers({ lat: 2, lose: () => (k = (k * 1103515245 + 12345) >>> 0, (k >>> 16) % 20 === 0) });
    for (let r = 0; r < 900 && common(P.A, P.B) < 600; r++) P.round();
    const n = common(P.A, P.B), s = P.stats();
    ok("!! at 5% loss the race still plays on (the net sends each input several times) and the two peers still agree on every tick", n >= 600 && sameHashes(P.A, P.B, n) === -1 && !P.A.session.desync() && !P.B.session.desync(), `${n} ticks in ${s.clock} rounds, ${s.dropped} of ${s.sent} messages lost`);
}

sec("5. THE ENGINE IS PART OF THE PROTOCOL: a peer on another engine halts the pair before a step");
{
    const P = await twoPeers({ lat: 1, backendB: "someone-elses-box3d" });
    for (let r = 0; r < 60; r++) P.round();
    const h = P.A.net.halted();
    ok("!! peers whose engines differ never step: both halted, no tick advanced, and the reason names both engines", !!h && !!P.B.net.halted() && P.A.session.tick === 0 && P.B.session.tick === 0 && /someone-elses-box3d/.test(h.reason) && h.ours === P.fleet, h ? h.reason.slice(0, 90) : "not halted");
}

sec("6. THE CONTRACT'S SMALL GUARDS");
{
    const m = await newModule(), w = () => worldFromModule(m, [0, -9.81, 0]);
    const s = createRaceSession({ worldFrom: w, peers: ["A", "B"], owner: { 0: "A" }, drivers: drivers.slice(0, 2), gunners: gunners.slice(0, 2), seed: 1, seconds: 2, fleet: "00000000" });
    const feed = () => { s.submitInputs("A", s.tick, s.inputFn("A")()); s.submitInputs("B", s.tick, []); };   // B owns nothing here and sends an empty list
    feed(); s.tryStep(C.CAR.dt);
    ok("a car nobody owns coasts: its commands are NEUTRAL, throttle 0 and the gun still", JSON.stringify(s.log[0][1]) === JSON.stringify(NEUTRAL) && s.log[0][0].throttle !== undefined);
    let threw = null; try { s.tryStep(1 / 30); } catch (e) { threw = e; }
    ok("the timestep is part of the contract: a step at any dt but the race's own throws LOCKSTEP_DT_MISMATCH instead of diverging at tick 1", !!threw && threw.code === "LOCKSTEP_DT_MISMATCH", threw ? threw.code : "no throw");
    // a peer's hash that arrives BEFORE we have stepped that tick is kept, and compared when we do
    s.checkPeerHash("B", 1, 12345);
    feed(); s.tryStep(C.CAR.dt);
    const d = s.desync();
    ok("!! a peer hash that arrives early is KEPT and compared when we step that tick: a wrong one filed at tick 1 before tick 1 ran is a desync at tick 1 (the ship session drops it and finds the desync a tick later)", !!d && d.tick === 1 && d.peer === "B" && d.remote === 12345, JSON.stringify(d));
    ok("a stale input (a tick already stepped) is refused, not filed where nothing will ever look", s.submitInputs("A", 0, []) === false && s.staleDropped() === 1);
}

console.log(fails ? `\nraceLockstep-selfcheck: ${fails} FAILED` : "\nraceLockstep-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
