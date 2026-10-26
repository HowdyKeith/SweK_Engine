// WebGLEngine/render/subAquariumCompass-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquariumCompass-selfcheck.mjs      (~25 s)
//
// THE COMPASS OF THE TANK HELD TO ITS WORD. render/subAquariumSim.mjs can take the compass away from every sub in the tank (setCompass('dropout')) and flies a pilot of kind 'navigator' (the PD autopilot behind tools/subNavigator.mjs). The existing tank gate (render/subAquariumSim-selfcheck.mjs) holds the rest of the tank.
//   1  THE CLOCK     compassState: dark for the last 16 s of every 48 s, by hand (lit at 31.9 s, dark with 16 s left at 32, 8 left at 40, lit again at 48, an offset, a negative age); the constants; the modes
//   2  THE MODES     'lit' by default; 'dropout' by setCompass; anything else is refused by name and changes nothing
//   3  THE SCHEDULE  seen from the tank: a sub's dark flag equals compassState on every tick, its dark stretches are 16 s (480 ticks) long and a third of the time, its seconds left count down by one tick a tick, two ids have two phases, the same id the same schedule twice
//   4  WHAT A PILOT SEES  a pilot registered for the gate records what it is handed: on a lit tick the true state and { compassValid: 1 }; on a dark tick a state whose heading is the LAST LIT heading, held, with { compassValid: 0 } and the depth, pitch, bank, speed and body rates TRUE; one steering target object for the sub's life
//   5  THE NAVIGATOR the same sub (the same id) flown as 'autopilot' and as 'navigator' is bit for bit the same while the compass is lit; with the compass in dropout the navigator's track stays within 0.01 rad and 1 m of its own lit track over four tank-minutes while the PD autopilot's strays by more than 0.15 rad and 10 m;
//                    the navigator's believed heading is within 0.03 rad of the truth in the dark and the PD autopilot's is the held one; a peer cannot send a navigator
//   6  PILOT KINDS   registerPilot (its refusals, its factory used for subs added after, an unknown kind falls back to the PD autopilot); a lost sub in the dark respawns with its held heading and a new steering object
// NOT CHECKED, said plainly: how the page draws the dark subs (tools/ship/subAquariumCompassPage-selfcheck.mjs); that the tank's wandering targets are the study's dives (they are not).
//
// SABOTAGE LOG (the thing broken -> the rows that went red; every mutant must be red BY NAME):
//   (filled in when the sabotage is run)
"use strict";
import { createRequire } from "node:module";
import * as A from "./subAquariumSim.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as AS from "../brain/autopilotSub.mjs";

const C = createRequire(import.meta.url)("../ai-bridge/subAquariumCore.js");
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const guarded = async (name, f) => { try { await f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.message) || e).slice(0, 220)); } };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol, J = (v) => JSON.stringify(v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const entry = (id, pilot = "autopilot", extra = {}) => ({ id, name: "Sub " + id, hue: 100, pilot, from: "x", local: true, weights: null, ...extra });
const DT = 1 / 30;
console.log("subAquariumCompass-selfcheck -- the compass of the tank\n");

sec("1. the clock of the compass, worked by hand");
await guarded("section 1", async () => {
    const cs = (age, phase = 0) => A.compassState(age, phase);
    ok("!! the compass is dark for the last 16 s of every 48 s: lit at 0 and at 31.9 s, dark with 16 s left at 32, with 8 left at 40, with 1 left at 47, lit again at 48 and at 80 (a second cycle: 32 + 48)", J(cs(0)) === '{"dark":false,"left":0}' && J(cs(31.9)) === '{"dark":false,"left":0}' && J(cs(32)) === '{"dark":true,"left":16}' && J(cs(40)) === '{"dark":true,"left":8}' && J(cs(47)) === '{"dark":true,"left":1}' && J(cs(48)) === '{"dark":false,"left":0}' && J(cs(80)) === '{"dark":true,"left":16}');
    ok("!! a phase is a shift: phase 10 makes 22 s the start of the dark (16 left) and 38 s lit again; a negative age counts back from the end of the cycle (-1 s is dark with 1 s left); a phase past a cycle wraps", J(cs(22, 10)) === '{"dark":true,"left":16}' && J(cs(38, 10)) === '{"dark":false,"left":0}' && J(cs(-1)) === '{"dark":true,"left":1}' && J(cs(0, 80)) === '{"dark":true,"left":16}' && J(cs(-1, -1)) === '{"dark":true,"left":2}');
    ok("!! the constants: a cycle of 48 s, 16 of them dark; the modes are lit and dropout, frozen", A.CYCLE_SECONDS === 48 && A.DARK_SECONDS === 16 && J(A.COMPASS_MODES) === '["lit","dropout"]' && Object.isFrozen(A.COMPASS_MODES));
});

sec("2. the modes");
await guarded("section 2", async () => {
    const t = A.createTank(); t.sync([entry("a")]);
    ok("!! the compass is lit by default, and the snapshot says so (not dark, nothing left, the shown heading is the true one)", t.compass === "lit" && t.snapshot()[0].compass === "lit" && t.snapshot()[0].dark === false && t.snapshot()[0].darkLeft === 0);
    ok("!! setCompass('dropout') sets it and returns it; setCompass('lit') puts it back", t.setCompass("dropout") === "dropout" && t.compass === "dropout" && t.snapshot()[0].compass === "dropout" && t.setCompass("lit") === "lit" && t.compass === "lit");
    const e = throws(() => t.setCompass("dim")), e2 = throws(() => t.setCompass()), e3 = throws(() => t.setCompass("DROPOUT"));
    ok("!! anything else is refused by name and changes nothing (a wrong word, nothing, the wrong case)", /the compass is lit or dropout, got "dim"/.test(e || "") && e2 !== null && e3 !== null && t.compass === "lit");
});

sec("3. the schedule, seen from the tank");
await guarded("section 3", async () => {
    const run = (id, seconds) => { const t = A.createTank(); t.setCompass("dropout"); t.sync([entry(id)]); const flags = [], left = []; let phase = null; for (let i = 0; i < Math.round(seconds * 30); i++) { t.step(DT); const s = t.snapshot()[0]; flags.push(s.dark); left.push(s.darkLeft); phase = t.subs.get(id).phase; } return { flags, left, phase }; };
    const a = run("alpha", 200), b = run("beta", 200), a2 = run("alpha", 200);
    const age = (i) => (i + 1) * DT;
    ok("!! on every tick of 200 s the dark flag is what compassState says for the sub's age and its own phase, and the seconds left are compassState's (1e-6)", a.flags.every((f, i) => f === A.compassState(age(i), a.phase).dark) && a.left.every((l, i) => near(l, A.compassState(age(i), a.phase).left, 1e-6)) && a.flags.some(Boolean) && !a.flags.every(Boolean));
    let runs = []; let n = 0; a.flags.forEach((f, i) => { if (f) n++; else if (n) { runs.push(n); n = 0; } });
    ok("!! the dark stretches are 16 s long (480 ticks, one tick either way) and the compass is dark a third of the time (within four percent)", runs.length >= 3 && runs.every((r) => Math.abs(r - 480) <= 1) && Math.abs(a.flags.filter(Boolean).length / a.flags.length - 1 / 3) < 0.04, `runs ${J(runs)}, share ${(a.flags.filter(Boolean).length / a.flags.length).toFixed(3)}`);
    const first = a.flags.indexOf(true);
    ok("!! the seconds left count down by one tick a tick inside a stretch: 16 at its start, then 15.967 (1e-6)", near(a.left[first], 16, 0.04) && near(a.left[first] - a.left[first + 1], DT, 1e-6) && near(a.left[first] - a.left[first + 100], 100 * DT, 1e-6) && a.left.every((l, i) => (l === 0) === !a.flags[i]));
    ok("!! two ids have two phases and so two schedules; the same id is the same schedule twice (a tank is deterministic)", a.phase !== b.phase && a.phase >= 0 && a.phase < 48 && b.phase >= 0 && b.phase < 48 && a.flags.join() !== b.flags.join() && a.flags.join() === a2.flags.join() && a.phase === a2.phase);
    ok("!! the phase is a seeded hash of the id and not a random number: 'alpha' is at 22.367 s, 'beta' at 7.011, 'gamma' at 28.318 and 'zeta' at 47.595 s of the 48 (pinned from the hash by hand, two of them in the upper half of the range), always inside [0, 48)", a.phase === 22.367 && b.phase === 7.011 && [["gamma", 28.318], ["zeta", 47.595]].every(([id, ph]) => { const t = A.createTank(); t.sync([entry(id)]); return t.subs.get(id).phase === ph; }));
    const late = (() => { const t = A.createTank(); t.setCompass("dropout"); t.sync([entry("old")]); for (let i = 0; i < 100 * 30; i++) t.step(DT); t.sync([entry("old"), entry("late")]); let good = true, any = false; for (let i = 0; i < 100 * 30; i++) { t.step(DT); const sub = t.subs.get("late"), s = t.snapshot().find((x) => x.id === "late"), c = A.compassState(sub.age, sub.phase); if (s.dark !== c.dark) good = false; if (s.dark) any = true; } return good && any; })();
    ok("!! a sub that joins later keeps its OWN clock: its schedule follows its age and not the tank's (a sub added after 100 s is dark exactly when compassState says for its age)", late);
    const lit = (() => { const t = A.createTank(); t.sync([entry("alpha")]); for (let i = 0; i < 3000; i++) t.step(DT); const s = t.snapshot()[0]; return s.dark === false && s.darkLeft === 0 && s.shown === s.heading; })();
    ok("in the lit mode nothing is ever dark however long the tank runs, and the shown heading is the true one", lit);
});

sec("4. what a pilot is handed");
await guarded("section 4", async () => {
    const rec = [], targets = new Set();
    const t = A.createTank(); t.registerPilot("spy", () => { const inner = AS.pilot(); return (st, tgt, cur, aux) => { const a = S.attitude(st), truth = t.subs.get("spy1").state, b = S.attitude(truth); rec.push({ read: a.heading, truth: b.heading, aux: aux ? aux.compassValid : null, depth: [a.depth, b.depth], pitch: [a.pitch, b.pitch], bank: [a.bank, b.bank], speed: [a.speed, b.speed], w: [Array.from(st.w), Array.from(truth.w)], cur: cur.slice(), age: t.subs.get("spy1").age }); targets.add(tgt); return inner(st, tgt, cur, aux); }; });
    t.setCompass("dropout"); t.sync([entry("spy1", "spy")]);
    for (let i = 0; i < 100 * 30; i++) t.step(DT);
    const ph = t.subs.get("spy1").phase, dark = rec.filter((r) => r.aux === 0), lit = rec.filter((r) => r.aux === 1);
    ok("!! the pilot is told { compassValid } on EVERY tick, 1 when lit and 0 when dark, and a third of the ticks are dark", rec.length === 3000 && dark.length + lit.length === 3000 && Math.abs(dark.length / 3000 - 1 / 3) < 0.05 && rec.every((r) => r.aux === 0 || r.aux === 1) && rec.every((r) => (r.aux === 0) === A.compassState(r.age, ph).dark));
    ok("!! on a lit tick it reads the TRUE heading (exactly), and on a dark tick it reads the heading of the last lit tick, HELD: constant through the stretch", lit.every((r) => r.read === r.truth) && (() => { let held = null, ok2 = true; for (let i = 0; i < rec.length; i++) { const r = rec[i]; if (r.aux === 1) held = r.truth; else if (!near(r.read, held, 1e-9)) ok2 = false; } return ok2; })());
    ok("!! in the dark the truth has moved away from what it reads (the largest gap over the run is more than 0.2 rad: the dropout is not nothing here), while the depth, pitch, bank, speed and body rates it reads are TRUE (1e-9)", Math.max(...dark.map((r) => Math.abs(wrap(r.truth - r.read)))) > 0.2 && dark.every((r) => near(r.depth[0], r.depth[1], 1e-9) && near(r.pitch[0], r.pitch[1], 1e-9) && near(r.bank[0], r.bank[1], 1e-9) && near(r.speed[0], r.speed[1], 1e-9) && r.w[0].every((v, k) => near(v, r.w[1][k], 1e-12))));
    ok("the current it is handed is still zero in the dark (a turned zero vector)", dark.every((r) => r.cur.every((v) => Math.abs(v) < 1e-12)) && lit.every((r) => r.cur.every((v) => v === 0)));
    ok("!! the steering target is ONE object for the sub's life (a pilot that resets when its target object changes must not reset at every wandering target), and its values change over the run (the wandering is real)", targets.size === 1 && [...targets][0] !== undefined && (() => { const tg = [...targets][0]; return Number.isFinite(tg.depth) && Number.isFinite(tg.heading) && Number.isFinite(tg.speed); })());
    const tk = A.createTank(), seen = new Set(), hs = new Set(); tk.registerPilot("spy", () => { const inner = AS.pilot(); return (st, tgt, cur, aux) => { seen.add(tgt); hs.add(Math.round(tgt.heading * 1000)); return inner(st, tgt, cur, aux); }; }); tk.sync([entry("spy1", "spy")]);
    for (let i = 0; i < 200 * 30; i++) tk.step(DT);
    ok("and its heading really changes (more than three different headings in 200 s)", seen.size === 1 && hs.size > 3);
    const ts = A.createTank(); ts.sync([entry("st1")]); ts.step(DT); const ss = ts.subs.get("st1");
    ok("!! inside the steering box the steering object carries the sub's own wandering target exactly (depth, heading, speed); outside it the heading is the one that points at the middle of the tank and the speed is held to 2 m/s or less", ss.steer.depth === ss.target.depth && ss.steer.heading === ss.target.heading && ss.steer.speed === ss.target.speed && (() => { const st = ss.state; st.pos[0] = 10; st.pos[1] = 10; ts.step(DT); return ss.steer.heading === A.headingTo(10, 10, 250, 150) && ss.steer.speed <= 2 && ss.steer.depth === ss.target.depth; })());
    const tt = A.createTank(); tt.sync([entry("x1")]); for (let i = 0; i < 20 * 30; i++) tt.step(DT); const before = tt.snapshot()[0].heading; tt.setCompass("dropout"); const heldNow = tt.subs.get("x1").held;
    ok("switching to dropout takes the held heading from the heading the sub has at that moment (no jump on the first dark tick)", near(heldNow, before, 1e-9));
});

sec("5. the navigator");
await guarded("section 5", async () => {
    const mk = (mode, kinds) => { const t = A.createTank(); t.setCompass(mode); t.sync(kinds.map(([id, k]) => entry(id, k))); return t; };
    const lit1 = mk("lit", [["same", "autopilot"]]), lit2 = mk("lit", [["same", "navigator"]]); let identical = true;
    for (let i = 0; i < 120 * 30; i++) { lit1.step(DT); lit2.step(DT); const a = lit1.subs.get("same").state, b = lit2.subs.get("same").state; if (a.pos.some((v, k) => v !== b.pos[k]) || a.q.some((v, k) => v !== b.q[k])) { identical = false; break; } }
    ok("!! the same id flown as 'autopilot' and as 'navigator' is BIT FOR BIT the same boat for two tank-minutes while the compass is lit (the navigator passes the world through untouched)", identical);
    const kinds = [["p1", "autopilot"], ["p2", "autopilot"], ["p3", "autopilot"], ["p4", "autopilot"], ["n1", "navigator"], ["n2", "navigator"], ["n3", "navigator"], ["n4", "navigator"]];
    const lit = mk("lit", kinds), dk = mk("dropout", kinds), acc = { autopilot: { h: 0, d: 0, n: 0, belief: 0, dn: 0 }, navigator: { h: 0, d: 0, n: 0, belief: 0, dn: 0 } };
    for (let k = 0; k < 240 * 30; k++) { lit.step(DT); dk.step(DT); if (k % 15) continue; const sl = lit.snapshot(), sd = dk.snapshot(); for (const [id, kind] of kinds) { const a = sl.find((s) => s.id === id), b = sd.find((s) => s.id === id), m = acc[kind]; m.h += Math.abs(wrap(a.heading - b.heading)); m.d += Math.hypot(a.x - b.x, a.y - b.y); m.n++; if (b.dark) { m.belief += Math.abs(wrap(b.heading - b.believed)); m.dn++; } } }
    const pd = acc.autopilot, nv = acc.navigator;
    ok(`!! over four tank-minutes the NAVIGATOR's track in the dropout stays within 0.01 rad and 1 m of its own track with the compass lit (${(nv.h / nv.n).toFixed(4)} rad, ${(nv.d / nv.n).toFixed(2)} m), and the PD autopilot's strays by more than 0.15 rad and 10 m (${(pd.h / pd.n).toFixed(3)} rad, ${(pd.d / pd.n).toFixed(1)} m)`, nv.h / nv.n < 0.01 && nv.d / nv.n < 1 && pd.h / pd.n > 0.15 && pd.d / pd.n > 10);
    ok(`!! in the dark the navigator BELIEVES the truth to 0.03 rad (${(nv.belief / nv.dn).toFixed(4)}) and the PD autopilot believes the held heading, far from it (${(pd.belief / pd.dn).toFixed(3)} rad, more than 0.1)`, nv.dn > 100 && pd.dn > 100 && nv.belief / nv.dn < 0.03 && pd.belief / pd.dn > 0.1);
    const s = dk.snapshot(), pdSub = s.find((x) => x.id === "p1"), nvSub = s.find((x) => x.id === "n1");
    ok("the snapshot's believed heading is the true heading when lit, for both kinds, and `shown` is the compass reading: the held heading in the dark", (() => { const t = A.createTank(); t.sync([entry("q1"), entry("q2", "navigator")]); for (let i = 0; i < 100; i++) t.step(DT); return t.snapshot().every((x) => near(x.believed, x.heading, 0.03) && x.shown === x.heading); })() && Number.isFinite(pdSub.believed) && Number.isFinite(nvSub.believed));
    const bad = C.validateSub({ name: "Sneaky", circuit: "gfc", weights: null, pilot: "navigator", local: true, from: "10.0.0.9" });
    const reg = C.createRegistry(); reg.add(bad.sub, { from: "10.0.0.9", local: false }); const listed = reg.list().find((e) => e.name === "Sneaky");
    ok("!! a peer cannot send a navigator: a body that says pilot 'navigator' is validated down to its known fields (no pilot field), and the registry stamps the pilot kind itself from the weights (autopilot here)", bad.ok && !("pilot" in bad.sub) && listed && listed.pilot === "autopilot");
});

sec("6. pilot kinds, a lost sub in the dark, a new hull");
await guarded("section 6", async () => {
    const t = A.createTank(), e1 = throws(() => t.registerPilot("", () => {})), e2 = throws(() => t.registerPilot("k", "x")), e3 = throws(() => t.registerPilot(5, () => {}));
    ok("!! registerPilot refuses an empty kind, a factory that is not a function and a kind that is not a string, by name", /a kind \(a string\) and a factory \(a function\) are needed/.test(e1 || "") && e2 !== null && e3 !== null);
    let built = 0; t.registerPilot("mine", (en) => { built++; const inner = AS.pilot(); const p = (st, tgt, cur, aux) => inner(st, tgt, cur, aux); p.believed = () => 1.2345; return p; });
    t.sync([entry("a", "mine"), entry("b", "unknownkind")]);
    ok("!! a registered kind is built (once) for each sub of that kind added after it; an unknown kind is flown by the PD autopilot without a throw; the snapshot asks a pilot that has believed() for its heading", built === 1 && t.snapshot().find((x) => x.id === "a").believed === 1.2345 && Number.isFinite(t.snapshot().find((x) => x.id === "b").believed) && (t.step(DT), true));
    t.sync([entry("a", "mine"), entry("b", "unknownkind"), entry("c", "mine")]);
    ok("a sub already in the tank is not built again by a later sync (built stays 2 after 'c' joins)", built === 2);
    const k = A.createTank(); k.setCompass("dropout"); k.sync([entry("fl", "flood")]);
    k.registerPilot("flood", () => () => ({ thrust: 0.2, rudder: 0, sternPlane: -1, ballast: 1 })); k.sync([]); k.sync([entry("fl", "flood")]);
    let lostAt = -1; for (let i = 0; i < 600 * 30; i++) { k.step(DT); if (k.subs.get("fl").lost > 0) { lostAt = i; break; } }
    const sub = k.subs.get("fl"), s = k.snapshot()[0];
    const k2 = A.createTank(); k2.setCompass("dropout"); k2.registerPilot("flood", () => () => ({ thrust: 0.2, rudder: 0, sternPlane: -1, ballast: 1 })); k2.sync([entry("fl", "flood")]);
    let steerBefore = null, steerAfter = null; for (let i = 0; i < 600 * 30; i++) { steerBefore = k2.subs.get("fl").steer; k2.step(DT); if (k2.subs.get("fl").lost > 0) { steerAfter = k2.subs.get("fl").steer; break; } }
    ok("!! a sub that is lost in the dropout respawns near the middle with a fresh steering object, its held heading taken from the new heading, a clear trail and the loss counted", lostAt > 0 && sub.lost >= 1 && near(sub.held, S.attitude(sub.state).heading, 1e-9) && steerBefore !== null && steerAfter !== steerBefore && s.trail.length === 0 && Math.abs(s.x - 250) < 40 && Math.abs(s.y - 150) < 30, `lost at tick ${lostAt}`);
});

await guarded("section 7", async () => {
    const t = A.createTank(); t.setCompass("dropout"); t.sync([entry("h1")]); for (let i = 0; i < 40 * 30; i++) t.step(DT);
    const sub = t.subs.get("h1"), steerOld = sub.steer; t.setHull("nominal");
    ok("!! changing the hull puts the sub back in the water with a fresh steering object and a held heading taken from its new heading", sub.steer !== steerOld && near(sub.held, S.attitude(sub.state).heading, 1e-9));
});

finished = true;
console.log("  NOT CHECKED  how the page draws the dark subs (tools/ship/subAquariumCompassPage-selfcheck.mjs); that the tank's wandering targets are the study's dives (they are not)");
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
