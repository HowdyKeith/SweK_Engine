// WebGLEngine/brain/ogreSubBridge-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/ogreSubBridge-selfcheck.mjs      (~2 s)
//
// THE BRIDGE FROM THE SUB BRAINS TO THE VOXEL OGRE WORLD (brain/ogreSubBridge.mjs, and the hook in simulation/OgreScenario.js):
//   1  THE MAPPING    a brain starts at the entry's place, nose toward the OGRE (hand-worked at four bearings: the voxel +z is the vessel's LEFT, so an OGRE at +z is a NEGATIVE relative bearing); 2 m/s is 2 u/s
//                     (4 m a unit, 4 brain seconds a voxel second); brain ticks per voxel tick are round(dt x 4 / (1/30)), at least 1 and at most 40
//   2  THE EARS       the OGRE is heard ahead, with the bearing on the right side; the other defenders are NEVER heard (IFF); a hostile sub and a torpedo of the world are heard and classed; the OGRE at 2 km is not
//   3  THE GUNS       the tactician's fire leaves along the NOSE as a unit voxel vector, a reload of 10 brain seconds, six torpedoes and no more; the hit points it reads are the entry's (hp / maxHp x 100)
//   4  THE HULL       a boat that is lost (grounded) is reported dead and does nothing after; the bridge is deterministic; a side factory is required by name; a step with no brain is refused by name
//   5  THE WORLD      the real OgreScenario (headless, a fake `this` on its prototype): setSubBrains; a launched defender sub carries the brain, a ttl of 120 s and its hit points as maxHp; its ticks move it TOWARD the OGRE
//                     at the bridge's speed (not the scripted 9 u/s); it fires projectiles along its nose, team defender, torpedo, 16 u/s; the scripted sub is UNCHANGED (9 u/s, the same walker); a dead brain (hp 0) is
//                     removed; the OGRE's torpedoes and escort subs reach the brain's ears; main.js exposes ogre.brainSubs
//
// SABOTAGES (each mutant breaks the thing a row guards; the row that went red, by name; an entry that went 0 red is a finding, and was fixed):
//   brain/ogreSubBridge.mjs: B1 4 -> 8 m a unit (6) | B2 time scale 2 (4) | B3 heading y sign (1) | B4 fire dz sign (0 red THE FIRST TIME: the OGRE was dead ahead, so dz was 0 either way; an OGRE at -z now, 1) |
//   B5 brain ticks floor 0 (1) | B6 cap 400 (1) | B7 OGRE not loud (1) | B8 four torpedoes (3) | B9 reload 100 ticks (1) | B10 hit points ignore maxHp (0 red THE FIRST TIME: 30 of 30 and 15 of 30 read the same
//   either way; 15 of 60 now, 1) | B11 hostiles not heard (1) | B12 torpedoes heard as boats (1) | B13 a dead boat keeps stepping (1) | B14 a loss ignored (1) | B15 the entry not moved (3) | B16 world z mapped to x
//   (2) | B18 spawn ignores the entry's place (1) | B21 every boat the same id (0 red THE FIRST TIME; the ids row now, 1). Two mutants that were not mutants were dropped (a no-op edit). The scenario's hook:
//   THE SQUAD (section 6): S1 squad ignored (2) | S2 a squad of one (2) | S3 the axis not from the OGRE (2) | S4 boats never report (0 red THE FIRST TIME: the row said 'a fix or a projectile'; the boats-only datalink row now, 1) |
//   S5 probes never listen (0 red THE FIRST TIME; the probes-hear-what-boats-cannot row, 1) | S6 no probe ever launched (1) | S7 the stock unlimited (0 red THE FIRST TIME: a two-minute run against the cap of three, 1) |
//   S8 every boat index 0 (2) | S9 probe z left in metres (0 red THE FIRST TIME; the 37.5 u row, 1) | S10 the world's clock dropped (1). The two boats' crossing (2 u) was a real defect: a patrol at 2 m/s circles its station;
//   the boat eases to a 0.5 m/s creep within 40 m now. The scenario's hook: H1 brain not spawned (2) | H2 ttl 30 (1) | H3 fires at the OGRE instead of along the nose (1) | H4 brain subs still walk (3) | H5 a dead brain not removed (0 red THE FIRST TIME: only hp 0 was tried;
//   a boat lost to the floor now, 1) | H6 the world's torpedoes include the defenders' own (1) | H7 dead escorts heard (1) | H8 maxHp not set (1).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as B from "./ogreSubBridge.mjs";
import * as T from "./subTournament.mjs";
import { OgreScenario } from "../simulation/OgreScenario.js";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const HERE = path.dirname(fileURLToPath(import.meta.url)), rd = (f) => fs.readFileSync(path.join(HERE, "..", f), "utf8");
const GUNNER = { fireRange: 420, blindSnr: 22, pingAfter: 1, trackSpeed: 2.5 };
const gunner = () => T.makeSide("g", { theta: GUNNER }).side();
const spy = (cmd = {}) => { const seen = []; const f = () => ({ tactics: (obs) => { seen.push(obs); return { depth: 22, heading: 0, speed: 2, ...cmd }; }, pilot: T.makeSide("p").side().pilot }); f.seen = seen; return f; };
const runFor = (br, e, world, seconds, dt = 1 / 60) => { let r, last; for (let i = 0; i < seconds / dt; i++) { r = br.step(e, dt, world); if (r.fire) (last ||= []).push(r); } return { r, fires: last || [] }; };

console.log("1. THE MAPPING");
{
    const mk = (ogre) => { const br = B.createBridge(gunner), e = { x: 0, z: 0, hp: 30 }; br.spawn(e, { ogre }); return e.brain.heading; };
    ok("!! the heading is the engine's: an OGRE at +x is 0, at -z is pi/2 (a right turn increases it), at +z is -pi/2, at -x is pi", near(mk({ x: 50, z: 0 }), 0) && near(mk({ x: 0, z: -50 }), Math.PI / 2) && near(mk({ x: 0, z: 50 }), -Math.PI / 2) && near(Math.abs(mk({ x: -50, z: 0 })), Math.PI));
    const br = B.createBridge(gunner), e = { x: 12, z: -7, hp: 30 }; br.spawn(e, { ogre: { x: 100, z: -7 } });
    ok("the brain starts at the entry's place (4 m a unit) at 22 m and 2 m/s", near(e.brain.state.pos[0], 48) && near(e.brain.state.pos[1], -28) && near(e.brain.depth, 22) && near(e.brain.target.speed, 2));
    const q = B.createBridge(spy()), f = { x: 0, z: 0, hp: 30 }; q.spawn(f, { ogre: null }); const r = runFor(q, f, { ogre: null }, 1);
    ok("!! 2 m/s is 2 u/s: a second of voxel time moves a boat 1.6..2.2 u (and the entry with it)", r.r.x > 1.6 && r.r.x < 2.2 && near(f.x, r.r.x) && Math.abs(r.r.z) < 0.3, `${r.r.x.toFixed(2)}`);
    const steps = (dt) => { const b2 = B.createBridge(spy()), g = { x: 0, z: 0, hp: 30 }; b2.spawn(g, {}); return b2.step(g, dt, {}).steps; };
    ok("!! brain ticks a voxel tick: 2 at 1/60, 4 at 1/30, at least 1 for a sliver, 40 at most for a stall", steps(1 / 60) === 2 && steps(1 / 30) === 4 && steps(1e-5) === 1 && steps(5) === 40);
    ok("the config is the 4 m and 4 s of the header, and a second bridge can take another", q.cfg.metresPerUnit === 4 && q.cfg.timeScale === 4 && B.createBridge(gunner, { metresPerUnit: 2, timeScale: 8 }).cfg.timeScale === 8);
}

console.log("\n2. THE EARS");
{
    const hear = (world, place = { x: 0, z: 0 }, sec = 4) => { const f = spy(), br = B.createBridge(f), e = { ...place, hp: 30 }; br.spawn(e, { ogre: { x: place.x + 50, z: place.z } }); runFor(br, e, world, sec); return f.seen.flatMap((o) => o.contacts); };
    const ahead = hear({ ogre: { x: 25, z: 0 } });
    ok("an OGRE 100 m ahead is heard as a boat, near the nose", ahead.length >= 3 && ahead.every((c) => c.kind === "boat" && Math.abs(c.bearing) < 0.4), ahead.length + " contacts");
    const left = hear({ ogre: { x: 25, z: 25 } }, { x: 0, z: 0 }, 1);
    ok("!! +z is the LEFT: an OGRE at (+25, +25) is heard on a NEGATIVE bearing (about -45 degrees)", left.length >= 1 && left.every((c) => c.bearing < -0.4 && c.bearing > -1.2), left.map((c) => c.bearing.toFixed(2)).join());
    ok("an OGRE 6 km away is not heard (it is heard from 1.2 km, a boat from 0.5)", hear({ ogre: { x: 1500, z: 0 } }, { x: 0, z: 0 }, 8).length === 0);
    const two = spy(), br = B.createBridge(two), a = { x: 0, z: 0, hp: 30 }, b2 = { x: 5, z: 0, hp: 30 };
    br.spawn(a, {}); br.spawn(b2, {}); const w = { ogre: null }; for (let i = 0; i < 240; i++) { br.step(a, 1 / 60, w); br.step(b2, 1 / 60, w); }
    ok("!! the other defender is NEVER heard (IFF): two boats 20 m apart, no OGRE, no contact", two.seen.length > 4 && two.seen.every((o) => o.contacts.length === 0));
    const host = hear({ ogre: null, hostiles: [{ x: 25, z: 0 }] }), torp = hear({ ogre: null, torps: [{ x: 50, z: 0 }] });
    ok("a hostile sub of the world is heard as a boat; a torpedo of the world as a TORPEDO", host.length >= 3 && host.every((c) => c.kind === "boat") && torp.length >= 3 && torp.every((c) => c.kind === "torpedo"));
    const og = hear({ ogre: { x: 250, z: 0 } }, { x: 0, z: 0 }, 8).length, hs = hear({ ogre: null, hostiles: [{ x: 250, z: 0 }] }, { x: 0, z: 0 }, 8).length;
    ok("!! the OGRE is louder than a boat (the 10 dB): at 1 km it is heard on most looks, a 3 m/s hostile on a third of them at most", og >= 10 && hs * 3 <= og, `${og} v ${hs}`);
}

console.log("\n3. THE GUNS");
{
    const world = { ogre: { x: 30, z: 0 } };
    const f = spy({ fire: true, heading: 0 }), br = B.createBridge(f), e = { x: 0, z: 0, hp: 30 }; br.spawn(e, world); const { fires } = runFor(br, e, world, 40);
    ok("!! a tactician that always fires fires SIX and no more", e.brain.fired === 6 && fires.length === 6 && e.brain.ammo === 0, `${fires.length}`);
    const sp = fires.map((r) => r.fire); ok("the fire is a unit voxel vector along the nose, pointing at the OGRE it is aimed at (+x)", sp.every((v) => near(Math.hypot(v.dx, v.dz), 1, 1e-9)) && sp[0].dx > 0.9);
    const w2 = { ogre: { x: 0, z: -30 } }, f2 = spy({ fire: true, heading: Math.PI / 2 }), b2 = B.createBridge(f2), gz = { x: 0, z: 0, hp: 30 }; b2.spawn(gz, w2); const fz = runFor(b2, gz, w2, 3).fires[0];
    ok("!! the fire direction is the nose in voxel axes: a boat heading pi/2 (a right turn from +x) fires along -z", fz && near(fz.fire.dx, 0, 1e-6) && near(fz.fire.dz, -1, 1e-6), fz ? `${fz.fire.dx.toFixed(2)}, ${fz.fire.dz.toFixed(2)}` : "no fire");
    const gaps = [], seq = []; { const b3 = B.createBridge(spy({ fire: true })), g = { x: 0, z: 0, hp: 30 }; b3.spawn(g, world); for (let i = 0; i < 40 * 60; i++) { const r = b3.step(g, 1 / 60, world); if (r.fire) seq.push(g.brain.tick); } for (let i = 1; i < seq.length; i++) gaps.push(seq[i] - seq[i - 1]); }
    ok("!! the reload is 10 brain seconds: 300 brain ticks between shots (within the 15-tick look)", gaps.length === 5 && gaps.every((x) => x >= 300 && x <= 315), gaps.join());
    const s2 = spy(), b4 = B.createBridge(s2), g2 = { x: 0, z: 0, hp: 15, maxHp: 60 }; b4.spawn(g2, {}); runFor(b4, g2, {}, 3);
    ok("!! the tactician reads the entry's hit points as a percentage (15 of 60 is 25)", s2.seen.length > 0 && s2.seen.every((o) => near(o.self.hp, 25)));
    const s3 = spy(), b5 = B.createBridge(s3), g3 = { x: 0, z: 0, hp: 30 }; b5.spawn(g3, {}); runFor(b5, g3, {}, 3);
    ok("a full sub with no maxHp reads 100", s3.seen.every((o) => near(o.self.hp, 100)) && s3.seen[0].self.ammo === 6 && s3.seen[0].self.ready === true);
}

console.log("\n4. THE HULL");
{
    const dive = () => ({ tactics: () => ({ depth: 30, heading: 0, speed: 1 }), pilot: () => ({ pitch: 0, yaw: 0, thrust: 0, ballast: 1 }) });
    const br = B.createBridge(dive), e = { x: 0, z: 0, hp: 30 }; br.spawn(e, {}); let r, died = -1;
    for (let i = 0; i < 60 * 60; i++) { r = br.step(e, 1 / 60, {}); if (!r.alive && died < 0) died = i; }
    ok("!! a boat that sinks to the floor is reported dead (grounded), and does nothing after", died > 0 && r.status === "grounded" && r.steps === 0 && r.fire === null, `dead at tick ${died}`);
    const x0 = e.x; br.step(e, 1, {}); ok("a dead boat does not move the entry", e.x === x0);
    const run = () => { const q = B.createBridge(gunner), g = { x: 0, z: 0, hp: 30 }; q.spawn(g, { ogre: { x: 40, z: -10 } }); runFor(q, g, { ogre: { x: 40, z: -10 } }, 20); return [g.x, g.z, g.brain.fired]; };
    ok("the bridge is deterministic", JSON.stringify(run()) === JSON.stringify(run()));
    let m1 = "", m2 = ""; try { B.createBridge(null); } catch (x) { m1 = String(x.message); } try { B.createBridge(gunner).step({ x: 0, z: 0 }, 1 / 60, {}); } catch (x) { m2 = String(x.message); }
    ok("a missing side factory and a step with no brain are refused by name", /side factory/.test(m1) && /no brain/.test(m2), m1 + " | " + m2);
    const e2 = { x: 0, z: 0, hp: 30 }; const b6 = B.createBridge(gunner); b6.spawn(e2, {}); b6.drop(e2);
    const e3 = { x: 0, z: 0, hp: 30 }, e4 = { x: 9, z: 0, hp: 30 }; b6.spawn(e3, {});
    ok("!! every boat of a bridge has its own id (it staggers the look and keys the sonar luck): 1, 2, 3 and brainsMade says three", e2.brain === null && e3.brain.id === 2 && b6.spawn(e4, {}).id === 3 && b6.brainsMade() === 3);
    ok("drop takes the brain off the entry", e2.brain === null);
}

console.log("\n5. THE WORLD");
{
    const mkWorld = (bridge, over = {}) => {
        const sc = Object.create(OgreScenario.prototype), execs = [];
        Object.assign(sc, { defenderSubs: [], subBrains: null, escortSubs: [], projectiles: [], router: { exec: (c) => { execs.push(c); return { id: execs.length }; } }, particles: null, _sfxAt() {}, _currentEnv: "sea", _surfaceY: () => 0, _dock: { x: 0, z: 0, destroyed: false }, ogre: { position: { x: 60, z: -40 } }, active: true, _lastDefenderSubT: 0, ...over });
        if (bridge !== undefined) sc.setSubBrains(bridge); return { sc, execs };
    };
    const { sc } = mkWorld(B.createBridge(gunner)); sc._maybeLaunchDefenderSub(100); const s = sc.defenderSubs[0];
    ok("!! a launched defender sub carries a brain, a 120 s life and its hit points as maxHp", s && s.brain && s.ttl === 120 && s.maxHp === 30 && s.hp === 30);
    ok("setSubBrains answers whether brains are on, and null turns them off", sc.setSubBrains(null) === false && sc.subBrains === null && sc.setSubBrains(B.createBridge(gunner)) === true);
    const start = Math.hypot(60 - s.x, -40 - s.z); let t = 100; for (let i = 0; i < 60 * 10; i++) { t += 1 / 60; sc._tickDefenderSubs(1 / 60, t); }
    const mid = Math.hypot(60 - s.x, -40 - s.z);
    ok("!! in ten seconds it has closed on the OGRE by 15..26 u (the brain's 2 u/s), not the scripted 90", start - mid > 15 && start - mid < 26, `${(start - mid).toFixed(1)} u`);
    ok("the entry's x and z are the brain's (the periscope follows them)", near(s.x, s.brain.state.pos[0] / 4) && near(s.z, s.brain.state.pos[1] / 4));
    for (let i = 0; i < 60 * 30; i++) { t += 1 / 60; sc._tickDefenderSubs(1 / 60, t); }
    const torps = sc.projectiles.filter((p) => p.team === "defender" && p.torpedo);
    ok("!! it fires projectiles: team defender, torpedo, 16 u/s, level, along its nose (unit direction x 16)", torps.length >= 2 && torps.every((p) => near(Math.hypot(p.vx, p.vz), 16, 1e-6) && p.vy === 0 && p.ttl > 5 && p.ttl < 8), `${torps.length}`);
    const scr = mkWorld(undefined); scr.sc._maybeLaunchDefenderSub(100); const w = scr.sc.defenderSubs[0], wx = w.x; let tt = 100; for (let i = 0; i < 60; i++) { tt += 1 / 60; scr.sc._tickDefenderSubs(1 / 60, tt); }
    ok("!! the scripted sub is UNCHANGED: no brain, 9 u/s toward the OGRE (a second moves it 8..10 u)", !w.brain && Math.hypot(w.x - wx, w.z) > 8 && Math.hypot(w.x - wx, w.z) < 10.2, `${Math.hypot(w.x - wx, w.z).toFixed(2)}`);
    const dv = () => ({ tactics: () => ({ depth: 30, heading: 0, speed: 1 }), pilot: () => ({ pitch: 0, yaw: 0, thrust: 0, ballast: 1 }) });
    const sk = mkWorld(B.createBridge(dv)).sc; sk._maybeLaunchDefenderSub(100); const doomed = sk.defenderSubs[0]; let tk = 100; for (let i = 0; i < 60 * 14; i++) { tk += 1 / 60; sk._tickDefenderSubs(1 / 60, tk); }
    ok("!! a boat the brain loses to the floor is a dead entry: its hit points go to 0 and it is removed", !sk.defenderSubs.includes(doomed) && doomed.hp === 0 && doomed.brain.status === "grounded");
    s.hp = 0; sc._tickDefenderSubs(1 / 60, t + 1);
    ok("a brain sub with no hit points is removed and its periscope despawned", !sc.defenderSubs.includes(s));
    const cs = mkWorld(B.createBridge(gunner), { escortSubs: [{ x: 5, z: 5, hp: 10 }, { x: 9, z: 9, hp: 0 }], projectiles: [{ team: "ogre", torpedo: true, x: 1, z: 2 }, { team: "defender", torpedo: true, x: 3, z: 3 }, { team: "ogre", torpedo: false, x: 4, z: 4 }] }).sc, bw = cs._brainWorld();
    ok("!! the brain's world: the OGRE's place, the LIVING escorts, and only the OGRE's torpedoes", bw.ogre.x === 60 && bw.ogre.z === -40 && bw.hostiles.length === 1 && bw.hostiles[0].x === 5 && bw.torps.length === 1 && bw.torps[0].x === 1);
    const main = rd("main.js");
    ok("!! main.js exposes ogre.brainSubs and imports the bridge lazily (not at load)", /brainSubs: async/.test(main) && /import\("\.\/brain\/ogreSubBridge\.mjs"\)/.test(main) && !/^import .*ogreSubBridge/m.test(main) && /setSubBrains\(null\)/.test(main) && /squad: opts && opts\.squad \? \{ n: 2, probes: \[0\]/.test(main));
}

console.log("\n6. THE SQUAD IN THE VOXEL WORLD");
{
    const mkWorld = (bridge, ogre) => { const sc = Object.create(OgreScenario.prototype), execs = []; Object.assign(sc, { defenderSubs: [], subBrains: null, escortSubs: [], projectiles: [], router: { exec: (c) => { execs.push(c); return { id: execs.length }; } }, particles: null, _sfxAt() {}, _currentEnv: "sea", _surfaceY: () => 0, _dock: { x: 0, z: 0, destroyed: false }, ogre: { position: ogre }, active: true, _lastDefenderSubT: 0 }); sc.setSubBrains(bridge); return sc; };
    const run = (bridge, seconds, ogre = { x: 700, z: 0 }) => { const sc = mkWorld(bridge, ogre); let t = 100; const gaps = [], depths = []; let maxProbes = 0; for (let i = 0; i < seconds * 60; i++) { t += 1 / 60; sc._tickDefenderSubs(1 / 60, t); if (i % 60 === 0) maxProbes = Math.max(maxProbes, bridge.probes(t * bridge.cfg.timeScale).length); if (i % 60 === 0 && sc.defenderSubs.length === 2) { const [a, b] = sc.defenderSubs; gaps.push(Math.hypot(a.x - b.x, a.z - b.z)); depths.push([a.brain.depth, b.brain.depth]); } } return { sc, gaps, depths, t, maxProbes }; };
    const sqd = B.createBridge(gunner, { squad: { n: 2, probes: [0], hq: [0, 0] } }), r = run(sqd, 90);
    ok("!! the squad is built from the first boat and the OGRE's side: two stations across the approach axis (the OGRE is at +x: axis 0)", sqd.squad() && sqd.squad().config.n === 2 && sqd.squad().config.axis === 0 && sqd.squad().config.hq[0] === 0 && sqd.squad().config.probes[0] === 0);
    ok("!! the two boats keep apart once both are in the water (over 7.5 u = 30 m: the design floor is 0.4 of the 22 u between their stations, 8.8 u, since each sweeps 0.3 of the spread; from 40 s after the second is out)", r.gaps.length >= 20 && r.gaps.slice(40).every((g) => g > 7.5), `min ${Math.min(...r.gaps.slice(40)).toFixed(0)} u`);
    ok("each is in its own depth band (the two depths differ by 4 m or more after the first minute)", r.depths.slice(-5).every(([a, b]) => Math.abs(a - b) > 4), r.depths.at(-1).map((d) => d.toFixed(0)).join(" / "));
    const tb = r.t * sqd.cfg.timeScale, pr = { length: r.maxProbes };
    ok("!! a carrier sends a probe (a stationary hydrophone, listed in units with its depth) and the world gave the squad its clock (brain seconds = voxel x 4)", pr.length >= 1 && pr.length <= 3 && sqd.squad() && tb > 400 && sqd.probes(r.t * 4 - 100).every((p) => Number.isFinite(p.x) && Number.isFinite(p.z) && p.depth > 10), `${pr.length} probe(s) at most at once`);
    const plain = B.createBridge(gunner), r2 = run(plain, 60);
    ok("without a squad: no squad object, no probes", plain.squad() === null && plain.probes(r2.t * 4).length === 0);
    // the datalink, row by row: boats alone (no probes), then probes alone (the OGRE past the boats' ears, inside a probe's), then the stock
    const watch = (bridge, ogre, seconds) => { const sc = mkWorld(bridge, ogre); let t = 100; const seen = new Set(), tally = { b: 0, p: 0 }; let fixAt = null, near = null; for (let i = 0; i < seconds * 60; i++) { t += 1 / 60; sc._tickDefenderSubs(1 / 60, t); if (i % 30 === 0 && bridge.squad()) { for (const id of bridge.squad().heard(t * 4)) { seen.add(id); tally[id[0]]++; } if (bridge.squad().fix(t * 4) && fixAt === null) fixAt = i / 60; if (near === null && bridge.probes(t * 4).length) { const p = bridge.probes(t * 4)[0]; near = Math.min(...sc.defenderSubs.map((q) => Math.hypot(q.x - p.x, q.z - p.z))); } } } return { sc, seen, fixAt, near, t, tally }; };
    const w1 = watch(B.createBridge(gunner, { squad: { n: 2, probes: [] } }), { x: 260, z: 0 }, 80);
    ok("!! boats alone share: both boats hear an OGRE at 1 km, the datalink holds a bearing from each and a FIX comes of it (no probes in this squad)", w1.seen.has("b1") && w1.seen.has("b2") && ![...w1.seen].some((id) => id[0] === "p") && w1.fixAt !== null, `fix at ${w1.fixAt}s`);
    const w2 = watch(B.createBridge(gunner, { squad: { n: 2, probes: [0, 1] } }), { x: 540, z: 0 }, 80);
    ok("!! probes hear what the boats cannot: an OGRE 2 km out (past a boat's 1.4 km, inside a probe's 2.2) is heard by the probes on at least three times as many samples as by the boats", w2.tally.p > 0 && w2.tally.p >= 3 * w2.tally.b, JSON.stringify(w2.tally));
    ok("!! a probe is dropped 150 m (37.5 u) ahead of a boat, in UNITS (within 4 u of that at the first sample)", w2.near !== null && Math.abs(w2.near - 37.5) < 4, `${w2.near && w2.near.toFixed(1)} u`);
    { const b3 = B.createBridge(gunner, { squad: { n: 2, probes: [0] } }), sc3 = mkWorld(b3, { x: 900, z: 0 }); let t3 = 100, checked = 0, good = true;
      for (let i = 0; i < 60 * 40; i++) { t3 += 1 / 60; sc3._tickDefenderSubs(1 / 60, t3); if (i % 30 === 0) { const raw = b3.squad() ? b3.squad().liveProbes(t3 * 4) : [], us = b3.probes(t3 * 4); if (raw.length) { checked++; good &&= us.length === raw.length && us.every((u, k) => near(u.x * 4, raw[k].x, 1e-9) && near(u.z * 4, raw[k].y, 1e-9) && u.depth === raw[k].depth && u.id === raw[k].id); } } }
      ok("!! the probes list is the squad's own probes in UNITS: x and z times 4 m a unit are the metre positions, the depth and id the same (at every sample with a probe up)", checked >= 10 && good, `${checked} samples`); }
    const stock = B.createBridge(gunner, { squad: { n: 2, probes: [0] } }); watch(stock, { x: 900, z: 0 }, 118);
    ok("!! three probes to a carrier and no more, though it would send one every 10 voxel seconds for two minutes", stock.probesSent() === 3, `${stock.probesSent()}`);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
